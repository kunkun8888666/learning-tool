#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单词本字典后端 - 基于 argos-translate 的英译中翻译
用法:
    python translate.py "<word>" [from_code] [to_code]

输出: 单行 JSON 到 stdout
    成功: {"ok": true, "text": "翻译结果"}
    失败: {"ok": false, "error": "错误原因"}

说明:
    - 默认 en -> zh（英译中），符合单词本"中文释义"需求
    - 首次运行会自动 pip 安装 argos-translate 并下载 en_zh 语言包
    - 所有异常都输出为 JSON，保证调用方（main.js）始终可解析
"""

import sys
import json
import subprocess


def _emit(ok, text=None, error=None):
    """统一输出 JSON 到 stdout"""
    payload = {"ok": ok}
    if text is not None:
        payload["text"] = text
    if error is not None:
        payload["error"] = error
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def _ensure_argos():
    """确保 argos-translate 已安装，未安装则尝试 pip 安装"""
    try:
        import argostranslate  # noqa: F401
        return True
    except Exception:
        pass
    # 尝试安装（使用清华镜像加速）
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "argostranslate",
             "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        import argostranslate  # noqa: F401
        return True
    except Exception as e:
        return False


def _ensure_language_package(from_code, to_code):
    """确保 from->to 的语言包已安装，未安装则自动下载"""
    import argostranslate.package
    import argostranslate.translate

    installed = argostranslate.package.get_installed_packages()
    for pkg in installed:
        if pkg.from_code == from_code and pkg.to_code == to_code:
            return True

    # 下载并安装
    try:
        argostranslate.package.update_package_index()
        available = argostranslate.package.get_available_packages()
        candidate = None
        for pkg in available:
            if pkg.from_code == from_code and pkg.to_code == to_code:
                candidate = pkg
                break
        if candidate is None:
            return False
        dl_path = candidate.download()
        argostranslate.package.install_from_path(dl_path)
        return True
    except Exception:
        return False


def main():
    if len(sys.argv) < 2:
        _emit(False, error="缺少待翻译文本参数")
        return

    text = sys.argv[1]
    from_code = sys.argv[2] if len(sys.argv) > 2 else "en"
    to_code = sys.argv[3] if len(sys.argv) > 3 else "zh"

    if not _ensure_argos():
        _emit(False, error="argos-translate 未安装，且自动安装失败（请检查网络或手动 pip install argostranslate）")
        return

    try:
        import argostranslate.translate
    except Exception as e:
        _emit(False, error="argos-translate 导入失败: %s" % str(e))
        return

    if not _ensure_language_package(from_code, to_code):
        _emit(False, error="语言包 %s->%s 缺失，且自动下载失败（请手动安装）" % (from_code, to_code))
        return

    try:
        result = argostranslate.translate.translate(text, from_code, to_code)
        _emit(True, text=result)
    except Exception as e:
        _emit(False, error="翻译失败: %s" % str(e))


if __name__ == "__main__":
    main()
