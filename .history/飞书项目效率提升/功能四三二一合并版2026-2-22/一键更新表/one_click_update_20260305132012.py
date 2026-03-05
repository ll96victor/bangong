# -*- coding: utf-8 -*-
"""
一键更新表工具 v1.4
功能：批量提取飞书项目信息并导出为CSV/Excel

更新说明：
- v1.4 (2026-03-05): 
  - 重写提取逻辑，完全参照油猴脚本
  - 使用JavaScript执行提取，更可靠
  - 增加更多调试信息
- v1.3 (2026-03-05): 优化页面等待逻辑
- v1.2 (2026-03-05): 支持远程调试模式
- v1.0 (2026-03-05): 最小可用版本
"""

import os
import re
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException, WebDriverException
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG = {
    'debug_port': 9222,
    'page_timeout': 30,
    'wait_timeout': 10,
    'batch_size': 10,
    'batch_delay': 2,
    'link_delay': 3,
    'output_dir': os.path.join(SCRIPT_DIR, 'output')
}

INTERFERENCE_WORDS = ['解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', 
                      '所属模块', '发现迭代', '影响版本', '复现步骤', '问题现象', 
                      '处理结果', '备注']


def get_process_info_js(driver):
    """获取处理信息 - 使用JavaScript执行（参照油猴脚本）"""
    js_code = """
    const INTERFERENCE_WORDS = ['解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', 
                                '所属模块', '发现迭代', '影响版本', '复现步骤', '问题现象', 
                                '处理结果', '备注'];
    
    let processText = '';
    const labelElements = document.querySelectorAll('div, span, label');
    for (let el of labelElements) {
        const text = el.textContent.trim();
        if (text === '处理信息' || text === '处理信息:') {
            let contentEl = el.nextElementSibling;
            if (!contentEl || !contentEl.textContent.trim()) {
                contentEl = el.parentElement ? el.parentElement.nextElementSibling : null;
            }
            if (contentEl) {
                processText = contentEl.textContent.trim().replace(/\\s+/g, ' ');
            }
            break;
        }
    }
    
    if (['待填', ' 待填 ', '待填 '].includes(processText)) return '';
    if (INTERFERENCE_WORDS.some(word => processText.includes(word))) return '';
    return processText;
    """
    try:
        return driver.execute_script(js_code)
    except Exception as e:
        print(f"  [警告] 提取处理信息失败: {e}")
        return ''


def get_aihelp_link_js(driver, name):
    """获取aihelp链接 - 使用JavaScript执行（参照油猴脚本）"""
    js_code = """
    let ticketUrl = '';
    const allElements = document.querySelectorAll('div, span');
    for (let el of allElements) {
        if (el.textContent.trim().includes('原单链接：')) {
            const link = el.querySelector('a[href*="aihelp.net"]') || 
                         (el.nextElementSibling && el.nextElementSibling.querySelector('a[href*="aihelp.net"]'));
            if (link) {
                ticketUrl = link.href.trim();
                break;
            }
        }
    }
    
    if (!ticketUrl) {
        const pageText = document.body.innerText;
        const urlMatch = pageText.match(/https?:\\/\\/[^\\s]*aihelp\\.net[^\\s]*=[A-Z0-9]{6}\\b/);
        if (urlMatch) ticketUrl = urlMatch[0];
    }
    
    if (!ticketUrl && arguments[0] && arguments[0].includes('MCGG')) {
        const pageText = document.body.innerText;
        const ticketIdMatch = pageText.match(/Ticket\\s*ID\\s*=\\s*([A-Z0-9]{6})/i);
        if (ticketIdMatch) {
            ticketUrl = ticketIdMatch[1].toUpperCase();
        }
    }
    
    return ticketUrl;
    """
    try:
        return driver.execute_script(js_code, name)
    except Exception as e:
        print(f"  [警告] 提取aihelp链接失败: {e}")
        return ''


def extract_project_info(driver, url):
    """提取项目信息"""
    result = {
        '项目名称': '',
        '状态': '定位中未修复',
        '项目名称2': '',
        '空': '',
        '日期': datetime.now().strftime('%Y/%m/%d'),
        '来源': 'BugGarage',
        'aihelp链接': '',
        '处理信息': '',
        # '原始链接': url,  # 暂时注释，后续需要可启用
    }
    
    try:
        print(f"  [等待] 页面加载中...")
        
        for i in range(CONFIG['wait_timeout']):
            time.sleep(1)
            try:
                title = driver.title
                current_url = driver.current_url
                print(f"  [{i+1}s] 标题: {title[:40]}...")
                
                if '飞书项目' in title:
                    print(f"  [检测] 页面加载完成")
                    break
                if 'login' in current_url.lower() or 'passport' in current_url.lower():
                    print(f"  [提示] 检测到登录页面")
                    return result
            except:
                continue
        
        title = driver.title.strip()
        name = re.sub(r'\s*-\s*飞书项目.*', '', title)
        
        if not name or name == title:
            name = title.split('-')[0].strip()
        
        result['项目名称'] = name
        result['项目名称2'] = name
        
        time.sleep(0.5)
        result['处理信息'] = get_process_info_js(driver) or ''
        result['aihelp链接'] = get_aihelp_link_js(driver, name) or ''
        
        print(f"  [成功] {name}")
        if result['aihelp链接']:
            print(f"         aihelp: {result['aihelp链接'][:50]}...")
        if result['处理信息']:
            print(f"         处理信息: {result['处理信息'][:30]}...")
            
    except Exception as e:
        print(f"  [错误] 提取失败: {e}")
        result['项目名称'] = f'[提取失败: {str(e)[:20]}]'
    
    return result


def connect_to_chrome():
    """连接到已有的Chrome（调试模式）"""
    options = Options()
    options.add_experimental_option("debuggerAddress", f"127.0.0.1:{CONFIG['debug_port']}")
    
    print(f"\n[连接Chrome] 正在连接到调试端口 {CONFIG['debug_port']}...")
    
    try:
        driver = webdriver.Chrome(options=options)
        driver.set_page_load_timeout(CONFIG['page_timeout'])
        print("[连接成功] 已连接到现有Chrome")
        return driver
    except WebDriverException as e:
        if "cannot connect" in str(e).lower() or "cannot find" in str(e).lower():
            print(f"\n[连接失败] 未找到调试模式的Chrome")
            print("\n请先运行 '启动Chrome调试模式.bat' 启动Chrome")
            return None
        raise


def read_links(source):
    """读取链接列表"""
    links = []
    
    if os.path.isfile(source):
        print(f"\n[读取文件] {source}")
        with open(source, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and 'project.feishu.cn' in line:
                    links.append(line)
    else:
        print(f"\n[解析链接] 直接输入模式")
        for line in source.strip().split('\n'):
            line = line.strip()
            if line and not line.startswith('#') and 'project.feishu.cn' in line:
                links.append(line)
    
    links = list(dict.fromkeys(links))
    print(f"[链接数量] 共 {len(links)} 条有效链接")
    
    return links


def save_results(results, output_dir):
    """保存结果到CSV和Excel"""
    if not results:
        print("\n[警告] 没有结果可保存")
        return None, None
    
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    df = pd.DataFrame(results)
    
    csv_path = os.path.join(output_dir, f'项目信息_{timestamp}.csv')
    df.to_csv(csv_path, index=False, encoding='utf-8-sig')
    print(f"\n[CSV已保存] {csv_path}")
    
    excel_path = os.path.join(output_dir, f'项目信息_{timestamp}.xlsx')
    df.to_excel(excel_path, index=False, engine='openpyxl')
    print(f"[Excel已保存] {excel_path}")
    
    return csv_path, excel_path


def main():
    print("=" * 60)
    print("一键更新表工具 v1.4".center(50))
    print("=" * 60)
    
    print("\n请输入链接来源：")
    print("1. 输入txt文件路径")
    print("2. 直接粘贴链接（每行一个，空行结束）")
    print("3. 直接按Enter退出")
    
    source = input("\n请选择 (1/2/3): ").strip()
    
    if source == '3' or source == '':
        print("\n[退出] 用户取消操作")
        return
    
    if source == '1':
        file_path = input("请输入txt文件路径: ").strip().strip('"').strip("'")
        if not os.path.isfile(file_path):
            print(f"\n[错误] 文件不存在: {file_path}")
            return
        links = read_links(file_path)
    elif source == '2':
        print("请粘贴链接（每行一个），输入空行结束:")
        lines = []
        while True:
            line = input()
            if not line.strip():
                break
            lines.append(line)
        links = read_links('\n'.join(lines))
    else:
        links = read_links(source)
    
    if not links:
        print("\n[错误] 未找到有效链接")
        return
    
    driver = connect_to_chrome()
    if not driver:
        return
    
    results = []
    
    try:
        print(f"\n[开始处理] 共 {len(links)} 条链接")
        print("-" * 50)
        
        total = len(links)
        for idx, url in enumerate(links, 1):
            print(f"\n[{idx}/{total}] 正在处理...")
            print(f"  [链接] {url[:60]}...")
            
            try:
                driver.execute_script(f"window.open('{url}', '_blank');")
                driver.switch_to.window(driver.window_handles[-1])
                
                result = extract_project_info(driver, url)
                results.append(result)
                
                driver.close()
                driver.switch_to.window(driver.window_handles[0])
                
                if idx % CONFIG['batch_size'] == 0 and idx < total:
                    print(f"\n[批次完成] 已处理 {idx} 条，暂停 {CONFIG['batch_delay']} 秒...")
                    time.sleep(CONFIG['batch_delay'])
                    
            except Exception as e:
                print(f"  [错误] {e}")
                results.append({
                    '项目名称': '[错误]',
                    '状态': '定位中未修复',
                    '项目名称2': '[错误]',
                    '空': '',
                    '日期': datetime.now().strftime('%Y/%m/%d'),
                    '来源': 'BugGarage',
                    'aihelp链接': '',
                    '处理信息': '',
                    '原始链接': url
                })
                try:
                    driver.close()
                    driver.switch_to.window(driver.window_handles[0])
                except:
                    pass
        
        csv_path, excel_path = save_results(results, CONFIG['output_dir'])
        
        print("\n" + "=" * 60)
        print("执行完成".center(50))
        print("=" * 60)
        print(f"总链接数: {total}")
        success_count = len([r for r in results if r['项目名称'] and '[' not in r['项目名称']])
        fail_count = len([r for r in results if '[' in r['项目名称']])
        print(f"成功提取: {success_count}")
        print(f"失败数量: {fail_count}")
        
    except KeyboardInterrupt:
        print("\n\n[中断] 用户中断操作")
        if results:
            save_results(results, CONFIG['output_dir'])
    except Exception as e:
        print(f"\n[错误] {e}")
    finally:
        print("\n[提示] Chrome浏览器保持打开，可继续工作")


if __name__ == '__main__':
    main()
