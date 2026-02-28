#!/usr/bin/env python3
# 测试修复后的文件路径检查逻辑

import os

def test_file_check():
    user_input = "1.21.txt"
    
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath("d:/我的坚果云/打开多个链接/filter_links.py"))
    file_path_in_script_dir = os.path.join(script_dir, user_input)
    
    print(f"script_dir = {script_dir}")
    print(f"file_path_in_script_dir = {file_path_in_script_dir}")
    print(f"os.path.isfile('{file_path_in_script_dir}') = {os.path.isfile(file_path_in_script_dir)}")

test_file_check()