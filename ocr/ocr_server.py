#!/usr/bin/env python3
import sys
import io
import base64
import json
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import easyocr
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(f"ERROR: required package not installed ({e}). Please run: pip install easyocr Pillow numpy", file=sys.stderr)
    sys.exit(1)

try:
    import cv2
    _HAS_CV2 = True
except Exception:
    _HAS_CV2 = False


def preprocess_for_ocr(img_np):
    """对图片做轻量预处理以提升 EasyOCR 在单词表照片上的识别率。"""
    if not _HAS_CV2:
        return img_np
    try:
        if img_np.ndim == 3:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_np.copy()
        h, w = gray.shape
        scale = max(1.0, 1100.0 / float(max(h, w)))
        if scale > 1.0:
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        gray = cv2.medianBlur(gray, 3)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
    except Exception:
        return img_np


# 使用模块级变量保存 reader，避免每个请求重新创建（加载模型需要几十秒）
_ocr_reader = None
_reader_ready = False
_reader_error = None

def init_reader():
    """在后台线程初始化 EasyOCR reader（首次加载模型需要 30-60 秒）"""
    global _ocr_reader, _reader_ready, _reader_error
    print("Initializing EasyOCR reader (ch_sim + en)...", flush=True)
    try:
        _ocr_reader = easyocr.Reader(['ch_sim', 'en'], gpu=False, verbose=False)
        _reader_ready = True
        print("EasyOCR reader initialized successfully.", flush=True)
    except Exception as e:
        _reader_error = str(e)
        print(f"EasyOCR reader init FAILED: {e}", flush=True)
        traceback.print_exc()

def get_reader():
    """获取 reader，如果还没初始化完成则等待"""
    if _reader_error:
        raise RuntimeError(f"Reader init failed: {_reader_error}")
    if not _reader_ready:
        raise RuntimeError("Reader still initializing, please try again later")
    if _ocr_reader is None:
        raise RuntimeError("Reader not available")
    return _ocr_reader

class OCRHandler(BaseHTTPRequestHandler):
    def _send_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
    
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/health':
            self._send_response(200, {
                'status': 'ok',
                'reader_ready': _reader_ready,
                'reader_error': _reader_error
            })
        elif parsed.path == '/init':
            if _reader_ready:
                self._send_response(200, {'status': 'ok', 'message': 'OCR reader ready'})
            elif _reader_error:
                self._send_response(500, {'status': 'error', 'message': f'Reader init failed: {_reader_error}'})
            else:
                self._send_response(503, {'status': 'loading', 'message': 'OCR reader still initializing...'})
        else:
            self._send_response(404, {'status': 'error', 'message': 'Not found'})
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/ocr':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                
                if 'image' not in data or not data['image']:
                    self._send_response(400, {'status': 'error', 'message': 'Missing image parameter'})
                    return
                
                image_data = data['image']
                if image_data.startswith('data:image/'):
                    image_data = image_data.split(',', 1)[1]
                
                if not image_data:
                    self._send_response(400, {'status': 'error', 'message': 'Empty image data'})
                    return
                
                image_bytes = base64.b64decode(image_data)
                
                if len(image_bytes) == 0:
                    self._send_response(400, {'status': 'error', 'message': 'Decoded image is empty'})
                    return
                
                # 解码并统一转 RGB（兼容 RGBA / 调色板图）
                image = Image.open(io.BytesIO(image_bytes))
                image = image.convert('RGB')
                image_np = np.array(image)

                # 预处理：灰度 + 放大 + 对比度增强 + 降噪，提升单词表照片识别率
                image_np = preprocess_for_ocr(image_np)

                reader = get_reader()
                results = reader.readtext(image_np)

                # 按阅读顺序排序：先按行（顶部 y 分桶），同行按左侧 x
                results.sort(key=lambda r: (round(r[0][0][1] / 20), r[0][0][0]))

                text_parts = []
                for (bbox, text, confidence) in results:
                    if confidence < 0.3:
                        continue
                    text_parts.append({
                        'text': text,
                        'confidence': float(confidence),
                        'bbox': [[int(x) for x in point] for point in bbox]
                    })
                
                full_text = '\n'.join([item['text'] for item in text_parts])
                
                self._send_response(200, {
                    'status': 'ok',
                    'text': full_text,
                    'parts': text_parts
                })
                
            except json.JSONDecodeError:
                self._send_response(400, {'status': 'error', 'message': 'Invalid JSON'})
            except RuntimeError as e:
                self._send_response(503, {'status': 'error', 'message': str(e)})
            except Exception as e:
                print(f"OCR error: {e}", flush=True)
                traceback.print_exc()
                self._send_response(500, {
                    'status': 'error',
                    'message': str(e),
                    'traceback': traceback.format_exc()
                })
        else:
            self._send_response(404, {'status': 'error', 'message': 'Not found'})
    
    def log_message(self, format, *args):
        pass

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    
    # 在后台线程初始化 reader，不阻塞服务器启动
    import threading
    t = threading.Thread(target=init_reader, daemon=True)
    t.start()
    
    server = HTTPServer(('127.0.0.1', port), OCRHandler)
    print(f"OCR server listening on 127.0.0.1:{port}", flush=True)
    print("EasyOCR reader loading in background...", flush=True)
    server.serve_forever()

if __name__ == '__main__':
    main()
