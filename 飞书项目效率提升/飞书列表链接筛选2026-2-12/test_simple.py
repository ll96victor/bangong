#!/usr/bin/env python3
# 简化版测试脚本

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
        raise FileNotFoundError(f"File does not exist: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    links = []
    for line in lines:
        line = line.strip()
        if line and not line.startswith('#'):  # 忽略空行和注释
            if is_valid_url(line):
                links.append(line)
    
    return links

# 测试读取文件
file_path = "d:/我的坚果云/打开多个链接/1.21.txt"
print(f"Attempting to read file: {file_path}")

try:
    links = read_links_from_file(file_path)
    print(f"Found {len(links)} valid links:")
    for i, link in enumerate(links, 1):
        print(f"{i}. {link}")
except Exception as e:
    print(f"Error reading file: {e}")