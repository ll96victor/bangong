import webbrowser
import time
import os
import sys
import logging
from urllib.parse import urlparse
from collections import defaultdict

# 配置参数
CONFIG = {
    'delay': 1.0,                # 链接打开间隔（秒）
    'max_line_length': 1000,      # 单行最大长度
    'max_display_length': 60,     # 显示截断长度
    'max_invalid_display': 3,     # 最大无效行显示数量
    'max_failed_display': 5,      # 最大失败项显示数量
    'log_enabled': True,          # 是否启用日志记录
    'log_dir': "logs",            # 日志目录
    'log_filename': "url_opener.log"  # 日志文件名
}

# 跨平台ESC检测模块导入
try:
    import msvcrt  # Windows
except ImportError:
    msvcrt = None
try:
    import select  # Unix-like
except ImportError:
    select = None

def setup_logging():
    """配置日志记录系统"""
    if not CONFIG['log_enabled']:
        return
        
    log_dir = CONFIG['log_dir']
    log_file = os.path.join(log_dir, CONFIG['log_filename'])
    
    os.makedirs(log_dir, exist_ok=True)
    
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    logging.info("URL Opener 启动")

def log_event(message, level="info"):
    """记录日志事件"""
    if not CONFIG['log_enabled']:
        return
        
    if level.lower() == "error":
        logging.error(message)
    elif level.lower() == "warning":
        logging.warning(message)
    else:
        logging.info(message)

def normalize_url(url):
    """智能标准化URL格式（自动补全协议，防止重复）"""
    if not url:
        return None
    
    # 移除首尾空白和引号
    url = url.strip().strip('"').strip("'")
    
    # 如果已有协议则直接返回
    if url.startswith(('http://', 'https://')):
        return url
    
    # 检查是否包含非法空格或其他协议
    if ' ' in url or ('://' in url and not url.startswith(('http://', 'https://'))):
        return None
    
    # 自动补全https协议
    return f'https://{url}' if url else None

def is_valid_url(url):
    """验证URL格式是否有效（宽松版）"""
    try:
        final_url = normalize_url(url)
        if not final_url:
            return False
            
        result = urlparse(final_url)
        # 验证协议和域名
        return all([
            result.scheme in ('http', 'https'),
            result.netloc,
            '.' in result.netloc  # 简单域名验证
        ])
    except Exception:
        return False

def check_esc_pressed():
    """可靠的跨平台ESC键检测（带异常处理，避免消耗输入字符）"""
    try:
        if os.name == 'nt' and msvcrt:
            if msvcrt.kbhit():
                key = msvcrt.getch()
                # 检测ESC键或Ctrl+C
                if key in (b'\\x1b', b'\\x03'):
                    return True
                # 其他键放回输入缓冲区
                msvcrt.ungetch(key)
        elif select and sys.stdin:
            # 使用sys.stdin.fileno()避免消耗字符（Linux/Mac）
            if select.select([sys.stdin], [], [], 0)[0]:
                key = os.read(sys.stdin.fileno(), 1)
                # 检测ESC键或Ctrl+C
                if key in (b'\\x1b', b'\\x03'):
                    return True
                # 非ESC键放回缓冲区
                os.write(sys.stdin.fileno(), key)
    except Exception as e:
        log_event(f"ESC检测错误: {str(e)}", "error")
    return False

def check_file_access(file_path):
    """全面检查文件可访问性"""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"文件不存在: {file_path}")
    
    try:
        # 检查文件大小避免处理过大文件
        if os.path.getsize(file_path) > 10 * 1024 * 1024:  # 10MB
            raise IOError("文件过大（超过10MB），请使用较小的文件")
            
        # 实际尝试读取第一行
        with open(file_path, 'r', encoding='utf-8') as test_file:
            test_file.readline()
    except PermissionError:
        raise PermissionError(f"没有读取权限: {file_path}")
    except UnicodeDecodeError:
        # 尝试其他常见编码
        try:
            with open(file_path, 'r', encoding='latin-1') as test_file:
                test_file.readline()
            raise Exception("文件编码问题，请转换为UTF-8格式")
        except:
            raise Exception("文件编码问题，请使用UTF-8或ASCII格式保存文件")
    except Exception as e:
        raise IOError(f"无法读取文件: {str(e)}")

def read_links_file(file_path):
    """读取并验证链接文件，返回(有效链接列表, 无效行列表)"""
    check_file_access(file_path)
    
    valid_links = []
    invalid_lines = []
    seen_urls = set()  # 用于URL去重
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            # 处理超长行
            if len(line) > CONFIG['max_line_length']:
                invalid_lines.append((line_num, f"行长度超过限制（最大{CONFIG['max_line_length']}字符）"))
                continue
                
            line = line.strip()
            if not line or line.startswith('#'):
                continue  # 跳过空行和注释
            
            if is_valid_url(line):
                final_url = normalize_url(line)
                
                # URL去重
                if final_url in seen_urls:
                    invalid_lines.append((line_num, f"重复链接: {display_link(final_url)}"))
                    continue
                    
                seen_urls.add(final_url)
                valid_links.append((line_num, final_url))
            else:
                invalid_lines.append((line_num, line))

    return valid_links, invalid_lines

def parse_direct_links(input_text):
    """解析直接输入的链接文本，返回(有效链接列表, 无效行列表)"""
    valid_links = []
    invalid_lines = []
    seen_urls = set()  # 用于URL去重
    
    lines = input_text.strip().split('\\n')
    
    for line_num, line in enumerate(lines, 1):
        # 处理超长行
        if len(line) > CONFIG['max_line_length']:
            invalid_lines.append((line_num, f"行长度超过限制（最大{CONFIG['max_line_length']}字符）"))
            continue
            
        line = line.strip()
        if not line or line.startswith('#'):
            continue  # 跳过空行和注释
        
        if is_valid_url(line):
            final_url = normalize_url(line)
            
            # URL去重
            if final_url in seen_urls:
                invalid_lines.append((line_num, f"重复链接: {display_link(final_url)}"))
                continue
                
            seen_urls.add(final_url)
            valid_links.append((line_num, final_url))
        else:
            invalid_lines.append((line_num, line))

    return valid_links, invalid_lines

def display_link(link):
    """智能显示链接（优化截断）"""
    max_len = CONFIG['max_display_length']
    if len(link) <= max_len:
        return link
    return f"{link[:max_len]}..."

def open_url_with_delay(url, delay):
    """精确控制时间的URL打开"""
    start_time = time.time()
    try:
        # 使用新标签页打开
        webbrowser.open(url, new=2)
    except webbrowser.Error as e:
        raise Exception(f"浏览器错误: {str(e)}")
    
    # 计算实际耗时
    elapsed = time.time() - start_time
    remaining_delay = max(0, delay - elapsed)
    if remaining_delay > 0:
        time.sleep(remaining_delay)
    
    return elapsed

def print_progress(current, total, prefix="", length=30):
    """显示进度条"""
    percent = current / total
    filled = int(length * percent)
    bar = '█' * filled + '-' * (length - filled)
    print(f"\\r{prefix} |{bar}| {current}/{total} ({percent:.0%})", end='\\r')
    if current == total:
        print()  # 完成后换行

def batch_open_links():
    """主操作函数"""
    setup_logging()
    
    print("="*50)
    print("📌 批量链接打开工具".center(40))
    print("="*50)
    print("使用方法:")
    print("- 输入文本文件路径 或 直接粘贴链接 (或直接按 Enter 退出)")
    print("- 支持 http/https 链接，自动补全协议")
    print("- 按 ESC 或 Ctrl+C 可随时中断操作")
    print("- # 开头的行会被视为注释")
    print(f"- 链接打开间隔：{CONFIG['delay']}秒")
    print("="*50)
    log_event("程序启动")
    
    while True:
        try:
            # 获取输入 - 可以是文件路径或直接粘贴的链接
            print("\\n请输入链接文件路径 或 直接粘贴链接 (每行一个链接):")
            print("(直接按 Enter 退出程序)")
            user_input = input().strip()
            
            # 检查是否为空输入（Enter键退出）
            if not user_input:
                print("\\n🛑 用户退出操作")
                log_event("用户退出程序")
                return
            
            # 检查退出命令
            if user_input.lower() in ('exit', 'quit'):
                print("\\n🛑 用户退出操作")
                log_event("用户退出程序")
                return
                
            # 判断是文件路径还是直接链接
            if os.path.isfile(user_input):
                # 是文件路径
                links, invalid_lines = read_links_file(user_input)
                log_event(f"文件加载成功: {user_input}, 有效链接: {len(links)}, 无效行: {len(invalid_lines)}")
            else:
                # 是直接粘贴的链接 or multiple links entered line by line
                all_input = user_input
                
                # Check if user wants to enter more lines (empty line means finish)
                print("继续输入更多链接 (每行一个)，或直接按 Enter 结束输入:")
                while True:
                    next_line = input()
                    if not next_line.strip():  # Empty line means finish
                        break
                    all_input += "\\n" + next_line
                
                # Parse all the links
                links, invalid_lines = parse_direct_links(all_input)
                log_event(f"直接链接输入处理完成, 有效链接: {len(links)}, 无效行: {len(invalid_lines)}")
            
            if invalid_lines:
                print(f"\\n⚠️ 跳过 {len(invalid_lines)} 个无效行 (示例):")
                for line_num, line in invalid_lines[:CONFIG['max_invalid_display']]:
                    print(f"  第{line_num}行: {display_link(str(line))}")
                if len(invalid_lines) > CONFIG['max_invalid_display']:
                    print(f"  ...还有 {len(invalid_lines) - CONFIG['max_invalid_display']} 行未显示")
            
            if not links:
                print("\\n⚠️ 未找到有效链接")
                continue
                
            # 准备打开链接
            print(f"\\n🔍 找到 {len(links)} 个有效链接")
            print(f"开始打开... (按 ESC 或 Ctrl+C 中断)")
            print("-"*50)
            
            success = 0
            failed = []
            error_counts = defaultdict(int)  # 错误类型统计
            start_time = time.time()
            
            for idx, (line_num, link) in enumerate(links, 1):
                if check_esc_pressed():
                    raise KeyboardInterrupt
                    
                # 显示进度
                print_progress(idx, len(links), "进度")
                
                try:
                    open_time = open_url_with_delay(link, CONFIG['delay'])
                    success += 1
                    print(f"\\r✅ [{idx}] 已打开: {display_link(link)} (耗时: {open_time:.2f}s)")
                except Exception as e:
                    failed.append((line_num, link, str(e)))
                    error_counts[str(e)] += 1
                    print(f"\\r❌ [{idx}] 失败: {display_link(link)} (错误: {e})")
            
            # 清除进度显示
            print(' ' * 80, end='\\r')
            
            # 输出统计结果
            total_time = time.time() - start_time
            print("\\n" + "="*50)
            print("📊 执行结果:")
            print(f"总链接数: {len(links)}")
            print(f"成功打开: {success}")
            print(f"失败数: {len(failed)}")
            print(f"总耗时: {total_time:.2f}秒")
            print(f"平均每个链接: {total_time/len(links):.2f}秒" if links else "")
            
            # 错误类型统计
            if error_counts:
                print("\\n⚠️ 错误类型统计:")
                for error, count in error_counts.items():
                    print(f"- {error}: {count}次")
            
            if failed:
                print(f"\\n❌ 失败详情 (前{CONFIG['max_failed_display']}项):")
                for line_num, link, err in failed[:CONFIG['max_failed_display']]:
                    print(f"[{line_num}] {display_link(link)} ({err})")
                if len(failed) > CONFIG['max_failed_display']:
                    print(f"...还有 {len(failed) - CONFIG['max_failed_display']} 项失败未显示")
            
            # 日志记录结果
            log_event(f"操作完成: 成功 {success}, 失败 {len(failed)}, 耗时 {total_time:.2f}秒")
            
            # 增加空行，优化视觉体验
            print("\\n" + "="*50)
            print("\\n👉 操作完成！可输入新文件路径或链接继续，或直接按 Enter 退出\\n")
            
        except FileNotFoundError as e:
            print(f"\\n❌ 错误: {str(e)}")
            log_event(f"文件未找到: {str(e)}", "error")
        except PermissionError as e:
            print(f"\\n❌ 错误: {str(e)}")
            log_event(f"权限错误: {str(e)}", "error")
        except Exception as e:  # 捕获自定义的编码错误提示
            print(f"\\n❌ 错误: {str(e)}")
            log_event(f"处理错误: {str(e)}", "error")
            
        except KeyboardInterrupt:
            print("\\n🛑 操作已中断")
            log_event("用户中断操作", "warning")
            # 不清除状态，允许用户继续输入

if __name__ == "__main__":
    try:
        batch_open_links()
    except Exception as e:
        print(f"\\n🔥 严重错误: {str(e)}")
        log_event(f"程序崩溃: {str(e)}", "error")