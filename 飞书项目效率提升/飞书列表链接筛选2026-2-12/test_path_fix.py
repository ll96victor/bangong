#!/usr/bin/env python3
# 测试修复后的文件路径检查逻辑

import os

def test_file_check():
    user_input = "1.21.txt"
    
    # 原始逻辑
    print("原始逻辑:")
    print(f"os.path.isfile('{user_input}') = {os.path.isfile(user_input)}")
    
    # 修复后的逻辑
    print("\n修复后的逻辑:")
    file_path = os.path.abspath(user_input) if not os.path.isabs(user_input) else user_input
    print(f"file_path = {file_path}")
    print(f"os.path.isfile('{file_path}') = {os.path.isfile(file_path)}")

test_file_check()