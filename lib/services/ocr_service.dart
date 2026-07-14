import 'dart:io';

/// OCR 识别服务（本地离线版）
/// 使用 PaddleOCR 本地模型，完全离线运行
/// 对标原 Electron 版的 ocr/ocr.py (EasyOCR → PaddleOCR)
class OcrService {
  // 注意：paddle_ocr_flutter 插件可能不支持所有平台
  // 这里提供接口，实际实现需要根据插件 API 调整
  bool _initialized = false;

  /// 检查 OCR 模型是否已初始化
  bool get initialized => _initialized;

  /// 初始化 OCR 模型（首次使用时会下载模型，约 20MB）
  Future<void> init() async {
    if (_initialized) return;

    try {
      print('正在初始化 PaddleOCR 模型...');
      // TODO: 根据实际 paddle_ocr_flutter 插件 API 调整
      // 这里假设插件有一个 initModel() 方法
      // await PaddleOcrFlutter.instance.initModel();
      _initialized = true;
      print('PaddleOCR 模型初始化成功');
    } catch (e) {
      print('PaddleOCR 模型初始化失败：$e');
      rethrow;
    }
  }

  /// 识别图片中的文字（本地离线识别）
  Future<String> recognizeImage(String imagePath) async {
    if (!_initialized) {
      await init();
    }

    final file = File(imagePath);
    if (!await file.exists()) {
      throw Exception('图片文件不存在：$imagePath');
    }

    try {
      print('开始识别图片：$imagePath');
      // TODO: 根据实际 paddle_ocr_flutter 插件 API 调整
      // 这里假设插件有一个 recognizeText() 方法，返回 List<String>
      // final results = await PaddleOcrFlutter.instance.recognizeText(imagePath);
      // 临时返回模拟数据，实际需要根据插件 API 调整
      await Future.delayed(const Duration(seconds: 2)); // 模拟识别时间
      final results = ['识别结果示例1', '识别结果示例2']; // 模拟数据

      if (results.isEmpty) {
        throw Exception('未能识别到文字，请确保图片清晰');
      }

      final text = results.join('\n');
      print('识别成功，共 ${results.length} 行文字');
      return text;
    } catch (e) {
      print('OCR 识别失败：$e');
      rethrow;
    }
  }

  /// 释放资源
  void dispose() {
    _initialized = false;
  }
}

/// 全局 OCR 服务实例
final ocrService = OcrService();
