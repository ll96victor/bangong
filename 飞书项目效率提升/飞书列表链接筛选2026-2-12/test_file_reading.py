#!/usr/bin/env python3
"""测试文件读取功能"""

import os
from urllib.parse import urlparse

def is_valid_url(url):
    """验证URL格式是否有效"""
    try:
        parsed = urlparse(url)
        return all([parsed.scheme in ('http', 'https'), parsed.netloc])
    except Exception:
        return False

def read_links_from_file(file_path):
    """从文件中读取链接"""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"文件不存在: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    print(f"文件共有 {len(lines)} 行")
    links = []
    for i, line in enumerate(lines, 1):
        print(f"第 {i} 行原始内容: {repr(line)}")  # 使用 repr 显示特殊字符
        original_line = line
        line = line.strip()
        print(f"第 {i} 行处理后内容: {repr(line)}")
        
        if line and not line.startswith('#'):  # 忽略空行和注释
            is_valid = is_valid_url(line)
            print(f"第 {i} 行URL验证结果: {is_valid}")
            if is_valid:
                links.append(line)
        else:
            print(f"第 {i} 行被跳过（空行或注释）")
        print()
    
    return links

# 测试读取文件
file_path = "d:\\我的坚果云\\打开多个链接\\1.21.txt"
print(f"正在读取文件: {file_path}")
links = read_links_from_file(file_path)
print(f"总共找到 {len(links)} 个有效链接")
for i, link in enumerate(links, 1):
    print(f"{i}. {link}")