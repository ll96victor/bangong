#!/usr/bin/env python3
# filter_links.py - 一个过滤链接的脚本
# 功能：读取链接、过滤、删除选中的链接，支持多行输入、单行输入和文件输入。

import os
import sys
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
    
    links = []
    for i, line in enumerate(lines, 1):
        original_line = line
        line = line.strip()
        if line and not line.startswith('#'):  # 忽略空行和注释
            if is_valid_url(line):
                links.append(line)
    
    return links


def parse_input_links(input_text):
    """从输入文本中解析链接"""
    lines = input_text.strip().splitlines()
    links = []
    for i, line in enumerate(lines, 1):
        original_line = line
        line = line.strip()
        if line and not line.startswith('#'):  # 忽略空行和注释
            is_valid = is_valid_url(line)
            if is_valid:
                links.append(line)
    return links


def display_links(links):
    """显示链接列表"""
    print("\n当前链接列表:")
    print("-" * 60)
    for i, link in enumerate(links, 1):
        print(f"{i:2d}. {link}")
    print("-" * 60)


def parse_indices(user_input, max_count):
    """解析用户输入的索引，支持单个数字、多个数字（逗号分隔）、范围（如1-5）"""
    indices = set()
    
    # 分割输入，支持逗号和空格分隔
    parts = user_input.replace(',', ' ').split()
    
    for part in parts:
        part = part.strip()
        if '-' in part and part.count('-') == 1:
            # 处理范围，如 "1-5"
            try:
                start, end = map(int, part.split('-'))
                if 1 <= start <= max_count and 1 <= end <= max_count:
                    indices.update(range(start, end + 1))
                else:
                    print(f"警告: 范围 {start}-{end} 超出有效范围 (1-{max_count})")
            except ValueError:
                print(f"警告: 无法解析范围 '{part}'")
        else:
            # 处理单个数字
            try:
                idx = int(part)
                if 1 <= idx <= max_count:
                    indices.add(idx)
                else:
                    print(f"警告: 索引 {idx} 超出有效范围 (1-{max_count})")
            except ValueError:
                print(f"警告: 无法解析索引 '{part}'")
    
    return sorted(list(indices))


def get_user_input():
    """获取用户输入，支持直接输入多个以换行符分隔的链接"""
    print("\n请输入链接（支持多行输入）:")
    print("  - 直接粘贴多个链接（每行一个）")
    print("  - 或输入文件路径")
    print("  - 输入空行结束多行输入")
    print("-" * 40)
    
    lines = []
    first_line = input().strip()
    
    if not first_line:
        return None
    
    # 检测输入模式
    # 1. 如果第一行是文件路径（文件存在）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path_in_script_dir = os.path.join(script_dir, first_line)
    
    if os.path.isfile(file_path_in_script_dir):
        return {'type': 'file', 'path': file_path_in_script_dir}
    
    # 2. 如果第一行包含换行符，直接解析多行
    if '\n' in first_line:
        lines = first_line.split('\n')
        return {'type': 'links', 'lines': lines}
    
    # 3. 检查第一行本身是否是有效URL（单行模式）
    if is_valid_url(first_line):
        # 如果是有效的单URL，继续等待更多行
        lines = [first_line]
        print("检测到有效链接，继续输入更多链接（空行结束，输入 '!' 取消）:")
        while True:
            line = input().strip()
            if line == '!':
                break
            if not line:
                break
            lines.append(line)
        return {'type': 'links', 'lines': lines}
    
    # 4. 可能是多行链接（用户直接粘贴但第一行还没按回车）
    # 提示用户继续输入
    lines = [first_line]
    print("继续输入更多链接（空行结束，输入 '!' 取消）:")
    while True:
        line = input().strip()
        if line == '!':
            break
        if not line:
            break
        lines.append(line)
    
    if len(lines) == 1:
        # 只有一行，检查是否是文件路径
        if os.path.isfile(os.path.join(script_dir, lines[0])):
            return {'type': 'file', 'path': os.path.join(script_dir, lines[0])}
    
    return {'type': 'links', 'lines': lines}


def filter_links():
    """主函数：过滤链接"""
    print("="*60)
    print("链接过滤工具".center(60))
    print("="*60)
    print("使用说明:")
    print("- 输入文件路径 或 直接粘贴多个链接")
    print("- 程序将显示链接列表并提示您选择要删除的序号")
    print("- 支持输入单个序号 (如: 1)、多个序号 (如: 1,3,5 或 1 3 5)、范围 (如: 1-5)")
    print("- 输入 'exit' 退出程序")
    print("="*60)
    
    while True:
        try:
            user_input = get_user_input()
            if user_input is None:
                # 直接继续
                print("未检测到输入，重新输入.")
                continue

            if user_input['type'] == 'file':
                links = read_links_from_file(user_input['path'])
            else:
                lines = user_input['lines']
                # 解析输入文本中的链接
                links = parse_input_links('\n'.join(lines))

            if not links:
                print("未找到有效链接，请检查输入")
                # 询问是否重新输入
                retry = input("是否重新输入？(Y/N): ").strip().lower()
                if retry in ('n', 'no'):
                    print("退出程序")
                    return
                else:
                    continue

            display_links(links)

            # 删除阶段
            while True:
                indices_input = input(f"\n请输入要删除的链接序号 (1-{len(links)})，支持多种格式: ").strip()
                if not indices_input:
                    print("请输入有效的序号")
                    continue
                if indices_input.lower() in ('back','b'):
                    print("返回上一级")
                    break

                selected_indices = parse_indices(indices_input, len(links))
                if not selected_indices:
                    print("未解析到有效索引，请重新输入")
                    continue

                print(f"\n将要删除以下链接:")
                for idx in sorted(selected_indices, reverse=True):
                    print(f"   {idx}. {links[idx-1]}")

                confirm = input(f"\n确认删除这 {len(selected_indices)} 个链接吗？(y/N): ").strip().lower()
                if confirm in ('y','yes','是'):
                    for idx in sorted(selected_indices, reverse=True):
                        del links[idx-1]
                    print(f"\n已删除 {len(selected_indices)} 个链接")

                    if not links:
                        print("所有链接都已被删除")
                        break
                    else:
                        print(f"剩余 {len(links)} 个链接:")
                        display_links(links)
                        continue_del = input("\n是否继续删除其他链接？(y/N): ").strip().lower()
                        if continue_del not in ('y','yes','是'):
                            print("\n最终保留的链接（无序号）:")
                            print("="*60)
                            for link in links:
                                print(link)
                            print("="*60)
                            break
                else:
                    print("取消删除")

                if links:
                    print(f"\n当前剩余的 {len(links)} 个链接:")
                    print("="*60)
                    for i, link in enumerate(links, 1):
                        print(f"{i}. {link}")
                    print("="*60)
                else:
                    print("\n所有链接都已删除")
                    break

            # 显示最终结果
            if links:
                print(f"\n最终保留的 {len(links)} 个链接:")
                print("="*60)
                for i, link in enumerate(links, 1):
                    print(f"{i}. {link}")
                print("="*60)
                
                # 再次输出不带序号的链接
                print(f"\n最终保留的链接（无序号）:")
                print("="*60)
                for link in links:
                    print(link)
                print("="*60)
                
                # 询问是否保存到文件
                save_choice = input("\n是否将结果保存到文件？(y/N): ").strip().lower()
                if save_choice in ('y','yes','是'):
                    filename = input("请输入保存的文件名: ").strip()
                    if filename:
                        try:
                            with open(filename, 'w', encoding='utf-8') as f:
                                for link in links:
                                    f.write(link + '\n')
                            print(f"结果已保存到 '{filename}'")
                        except Exception as e:
                            print(f"保存失败: {e}")
            
            # 继续处理其他输入
            continue_choice = input("\n是否继续处理其他链接？(Y/n): ").strip().lower()
            if continue_choice == 'n':
                print("\n退出程序")
                return
                
        except FileNotFoundError as e:
            print(f"\n错误: {e}")
        except KeyboardInterrupt:
            print("\n\n用户中断操作，退出程序")
            return
        except Exception as e:
            print(f"\n发生错误: {e}")


if __name__ == "__main__":
    filter_links()
