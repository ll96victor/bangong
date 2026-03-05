# -*- coding: utf-8 -*-
"""
一键更新表工具 v1.0
功能：批量提取飞书项目信息并导出为CSV/Excel

更新说明：
- v1.0 (2026-03-05): 最小可用版本
  - 支持从txt文件读取链接或直接输入链接
  - 复用Chrome登录态
  - 提取项目名称、aihelp链接、处理信息
  - 输出CSV和Excel两种格式
"""

import os
import re
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
import pandas as pd

CONFIG = {
    'chrome_user_data': r'C:\Users\admin\AppData\Local\Google\Chrome\User Data',
    'chrome_profile': 'Default',
    'page_timeout': 30,
    'wait_timeout': 15,
    'batch_size': 10,
    'batch_delay': 2,
    'link_delay': 1,
    'output_dir': r'c:\bangong\飞书项目效率提升\功能四三二一合并版2026-2-22\一键更新表\output'
}

INTERFERENCE_WORDS = ['解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', 
                      '所属模块', '发现迭代', '影响版本', '复现步骤', '问题现象', 
                      '处理结果', '备注']


def get_process_info(driver):
    """获取处理信息（从油猴脚本转换）"""
    try:
        elements = driver.find_elements(By.CSS_SELECTOR, 'div, span, label')
        for el in elements:
            text = el.text.strip()
            if text == '处理信息' or text == '处理信息:':
                content_el = el.find_element(By.XPATH, 'following-sibling::*')
                if not content_el or not content_el.text.strip():
                    try:
                        content_el = el.find_element(By.XPATH, '../following-sibling::*')
                    except:
                        pass
                if content_el:
                    process_text = content_el.text.strip().replace('\n', ' ').replace('\r', '')
                    if process_text in ['待填', ' 待填 ', '待填 ']:
                        return ''
                    for word in INTERFERENCE_WORDS:
                        if word in process_text:
                            return ''
                    return process_text
    except Exception as e:
        print(f"  [警告] 提取处理信息失败: {e}")
    return ''


def get_aihelp_link(driver, name):
    """获取aihelp链接（从油猴脚本转换）"""
    ticket_url = ''
    
    try:
        elements = driver.find_elements(By.CSS_SELECTOR, 'div, span')
        for el in elements:
            if '原单链接：' in el.text:
                try:
                    link = el.find_element(By.CSS_SELECTOR, 'a[href*="aihelp.net"]')
                    if link:
                        ticket_url = link.get_attribute('href').strip()
                        break
                except:
                    try:
                        next_el = el.find_element(By.XPATH, 'following-sibling::*')
                        link = next_el.find_element(By.CSS_SELECTOR, 'a[href*="aihelp.net"]')
                        if link:
                            ticket_url = link.get_attribute('href').strip()
                            break
                    except:
                        pass
        
        if not ticket_url:
            page_text = driver.find_element(By.TAG_NAME, 'body').text
            match = re.search(r'https?://[^\s]*aihelp\.net[^\s]*=[A-Z0-9]{6}\b', page_text)
            if match:
                ticket_url = match.group(0)
        
        if not ticket_url and name and 'MCGG' in name:
            page_text = driver.find_element(By.TAG_NAME, 'body').text
            match = re.search(r'Ticket\s*ID\s*=\s*([A-Z0-9]{6})', page_text, re.IGNORECASE)
            if match:
                ticket_url = match.group(1).upper()
    except Exception as e:
        print(f"  [警告] 提取aihelp链接失败: {e}")
    
    return ticket_url


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
        '原始链接': url
    }
    
    try:
        WebDriverWait(driver, CONFIG['wait_timeout']).until(
            lambda d: '飞书项目' in d.title
        )
        
        title = driver.title.strip()
        name = re.sub(r'\s*-\s*飞书项目.*', '', title)
        result['项目名称'] = name
        result['项目名称2'] = name
        
        result['处理信息'] = get_process_info(driver)
        result['aihelp链接'] = get_aihelp_link(driver, name)
        
        print(f"  [成功] {name}")
        if result['aihelp链接']:
            print(f"         aihelp: {result['aihelp链接'][:50]}...")
        if result['处理信息']:
            print(f"         处理信息: {result['处理信息'][:30]}...")
            
    except TimeoutException:
        print(f"  [超时] 页面加载超时")
        result['项目名称'] = '[加载超时]'
    except Exception as e:
        print(f"  [错误] {e}")
        result['项目名称'] = f'[提取失败: {e}]'
    
    return result


def create_driver():
    """创建浏览器驱动"""
    options = Options()
    options.add_argument(f'--user-data-dir={CONFIG["chrome_user_data"]}')
    options.add_argument(f'--profile-directory={CONFIG["chrome_profile"]}')
    options.add_argument('--no-first-run')
    options.add_argument('--no-default-browser-check')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option('excludeSwitches', ['enable-automation'])
    options.add_experimental_option('useAutomationExtension', False)
    
    print("\n[启动浏览器] 正在启动Chrome...")
    print("[注意] 请确保Chrome浏览器已关闭，否则可能无法复用登录态")
    
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(CONFIG['page_timeout'])
    
    return driver


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
    print("一键更新表工具 v1.0".center(50))
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
    
    print(f"\n[确认] 将处理 {len(links)} 条链接")
    confirm = input("是否继续? (y/n): ").strip().lower()
    if confirm != 'y':
        print("\n[退出] 用户取消操作")
        return
    
    driver = None
    results = []
    
    try:
        driver = create_driver()
        
        total = len(links)
        for idx, url in enumerate(links, 1):
            print(f"\n[{idx}/{total}] 正在处理...")
            print(f"  [链接] {url[:60]}...")
            
            try:
                driver.get(url)
                time.sleep(CONFIG['link_delay'])
                result = extract_project_info(driver, url)
                results.append(result)
                
                if idx % CONFIG['batch_size'] == 0 and idx < total:
                    print(f"\n[批次完成] 已处理 {idx} 条，暂停 {CONFIG['batch_delay']} 秒...")
                    time.sleep(CONFIG['batch_delay'])
                    
            except TimeoutException:
                print(f"  [超时] 页面加载超时，跳过")
                results.append({
                    '项目名称': '[超时]',
                    '状态': '定位中未修复',
                    '项目名称2': '[超时]',
                    '空': '',
                    '日期': datetime.now().strftime('%Y/%m/%d'),
                    '来源': 'BugGarage',
                    'aihelp链接': '',
                    '处理信息': '',
                    '原始链接': url
                })
            except Exception as e:
                print(f"  [错误] {e}")
                results.append({
                    '项目名称': f'[错误: {e}]',
                    '状态': '定位中未修复',
                    '项目名称2': f'[错误: {e}]',
                    '空': '',
                    '日期': datetime.now().strftime('%Y/%m/%d'),
                    '来源': 'BugGarage',
                    'aihelp链接': '',
                    '处理信息': '',
                    '原始链接': url
                })
        
        csv_path, excel_path = save_results(results, CONFIG['output_dir'])
        
        print("\n" + "=" * 60)
        print("执行完成".center(50))
        print("=" * 60)
        print(f"总链接数: {total}")
        print(f"成功提取: {len([r for r in results if r['项目名称'] and '[' not in r['项目名称']])}")
        print(f"失败数量: {len([r for r in results if '[' in r['项目名称']])}")
        
    except KeyboardInterrupt:
        print("\n\n[中断] 用户中断操作")
        if results:
            save_results(results, CONFIG['output_dir'])
    except WebDriverException as e:
        print(f"\n[错误] 浏览器错误: {e}")
        print("[提示] 请确保Chrome浏览器已关闭后重试")
    except Exception as e:
        print(f"\n[错误] {e}")
    finally:
        if driver:
            driver.quit()
            print("\n[浏览器] 已关闭")


if __name__ == '__main__':
    main()
