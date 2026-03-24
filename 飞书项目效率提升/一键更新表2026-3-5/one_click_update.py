# -*- coding: utf-8 -*-
"""
一键更新表工具 v1.7
功能：批量提取飞书项目信息并导出为CSV/Excel

更新说明：
- v1.7 (2026-03-20): 
  - 新增：自动检查 Chrome 版本并下载对应的 chromedriver
  - chromedriver 自动下载到系统目录
- v1.6 (2026-03-20): 
  - 修复粘贴多个链接时换行符丢失的问题
  - 新增：提取失败时等待20s，刷新后再等10s
- v1.5 (2026-03-05): 
  - 修复标题提取问题：等待标题格式正确后再提取
- v1.4 (2026-03-05): 重写提取逻辑，使用JavaScript执行
- v1.0 (2026-03-05): 最小可用版本
"""

import os
import re
import sys
import time
import zipfile
import shutil
import subprocess
import urllib.request
import json
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException, WebDriverException, SessionNotCreatedException
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_APP_DATA = os.environ.get('LOCALAPPDATA', os.path.expanduser('~/.local'))

CONFIG = {
    'debug_port': 9222,
    'page_timeout': 30,
    'wait_timeout': 10,
    'retry_wait': 20,
    'refresh_wait': 10,
    'batch_size': 10,
    'batch_delay': 2,
    'link_delay': 3,
    'output_dir': os.path.join(SCRIPT_DIR, 'output'),
    'chromedriver_dir': os.path.join(LOCAL_APP_DATA, 'chromedriver_feishu'),
    'chromedriver_path': os.path.join(LOCAL_APP_DATA, 'chromedriver_feishu', 'chromedriver.exe')
}

INTERFERENCE_WORDS = ['解决方案', '缺陷描述', '当前负责人', '优先级', '严重程度', 
                      '所属模块', '发现迭代', '影响版本', '复现步骤', '问题现象', 
                      '处理结果', '备注']


def get_chrome_version():
    """获取本地 Chrome 版本"""
    chrome_paths = [
        os.path.join(os.environ.get('PROGRAMFILES', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    
    for chrome_path in chrome_paths:
        if os.path.exists(chrome_path):
            try:
                result = subprocess.run(
                    [chrome_path, '--version'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                version = result.stdout.strip().split()[-1]
                print(f"[Chrome版本] {version}")
                return version
            except Exception as e:
                print(f"[警告] 获取Chrome版本失败: {e}")
                continue
    
    print("[警告] 未找到Chrome，尝试从注册表获取版本...")
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Google\Chrome\BLBeacon")
        version, _ = winreg.QueryValueEx(key, "version")
        print(f"[Chrome版本] {version} (从注册表)")
        return version
    except:
        pass
    
    return None


def get_chromedriver_download_url(chrome_version):
    """获取对应 Chrome 版本的 chromedriver 下载链接"""
    major_version = chrome_version.split('.')[0]
    
    try:
        if int(major_version) >= 115:
            api_url = "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json"
            print(f"[下载信息] 正在获取 chromedriver 下载地址...")
            
            with urllib.request.urlopen(api_url, timeout=30) as response:
                data = json.loads(response.read().decode())
            
            for version_info in reversed(data['versions']):
                if version_info['version'].startswith(f"{major_version}."):
                    for download in version_info['downloads'].get('chromedriver', []):
                        if download['platform'] == 'win32':
                            print(f"[匹配版本] chromedriver {version_info['version']}")
                            return download['url']
        else:
            base_url = f"https://chromedriver.storage.googleapis.com/LATEST_RELEASE_{major_version}"
            with urllib.request.urlopen(base_url, timeout=10) as response:
                specific_version = response.read().decode().strip()
            
            download_url = f"https://chromedriver.storage.googleapis.com/{specific_version}/chromedriver_win32.zip"
            print(f"[匹配版本] chromedriver {specific_version}")
            return download_url
            
    except Exception as e:
        print(f"[错误] 获取下载地址失败: {e}")
    
    return None


def download_and_extract_chromedriver(download_url, dest_dir):
    """下载并解压 chromedriver"""
    os.makedirs(dest_dir, exist_ok=True)
    
    zip_path = os.path.join(dest_dir, 'chromedriver.zip')
    
    print(f"[下载中] {download_url}")
    print(f"[保存到] {zip_path}")
    
    try:
        urllib.request.urlretrieve(download_url, zip_path)
        print(f"[下载完成] 正在解压...")
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for member in zip_ref.namelist():
                if member.endswith('chromedriver.exe'):
                    source = zip_ref.open(member)
                    target_path = os.path.join(dest_dir, 'chromedriver.exe')
                    with open(target_path, 'wb') as target:
                        shutil.copyfileobj(source, target)
                    print(f"[解压完成] {target_path}")
                    break
        
        os.remove(zip_path)
        return True
        
    except Exception as e:
        print(f"[错误] 下载/解压失败: {e}")
        return False


def check_and_download_chromedriver():
    """检查 chromedriver 是否存在且版本匹配，不匹配则自动下载"""
    chromedriver_path = CONFIG['chromedriver_path']
    chromedriver_dir = CONFIG['chromedriver_dir']
    
    chrome_version = get_chrome_version()
    if not chrome_version:
        print("[错误] 无法获取 Chrome 版本，请确保已安装 Chrome")
        return None
    
    if os.path.exists(chromedriver_path):
        try:
            result = subprocess.run(
                [chromedriver_path, '--version'],
                capture_output=True,
                text=True,
                timeout=10
            )
            driver_version = result.stdout.strip().split()[1]
            print(f"[chromedriver版本] {driver_version}")
            
            chrome_major = chrome_version.split('.')[0]
            driver_major = driver_version.split('.')[0]
            
            if chrome_major == driver_major:
                print(f"[版本匹配] Chrome {chrome_major}.x 与 chromedriver {driver_major}.x 匹配")
                return chromedriver_path
            else:
                print(f"[版本不匹配] Chrome {chrome_major}.x 与 chromedriver {driver_major}.x 不匹配")
                print(f"[自动更新] 正在下载新版本...")
                
        except Exception as e:
            print(f"[警告] 无法获取 chromedriver 版本: {e}")
            print(f"[重新下载] 正在下载...")
    
    download_url = get_chromedriver_download_url(chrome_version)
    if not download_url:
        print("[错误] 无法获取下载地址")
        print("[手动下载] 请访问: https://chromedriver.chromium.org/downloads")
        print(f"[手动安装] 下载后放到: {chromedriver_dir}")
        return None
    
    if download_and_extract_chromedriver(download_url, chromedriver_dir):
        return chromedriver_path
    
    return None


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
    }
    
    try:
        print(f"  [等待] 页面加载中...")
        
        for i in range(CONFIG['wait_timeout']):
            time.sleep(1)
            try:
                title = driver.title
                current_url = driver.current_url
                print(f"  [{i+1}s] 标题: {title[:50]}...")
                
                if 'login' in current_url.lower() or 'passport' in current_url.lower():
                    print(f"  [提示] 检测到登录页面")
                    return result
                
                if '飞书项目' in title and ' - ' in title:
                    print(f"  [检测] 页面加载完成")
                    break
            except:
                continue
        
        title = driver.title.strip()
        
        if ' - ' not in title:
            print(f"  [警告] 标题格式异常，尝试重新获取...")
            time.sleep(2)
            title = driver.title.strip()
        
        name = re.sub(r'\s*-\s*飞书项目.*', '', title)
        
        if not name or name == title or name == '飞书项目':
            print(f"  [警告] 无法从标题提取项目名称")
            name = '[提取失败]'
        
        result['项目名称'] = name
        result['项目名称2'] = name
        
        time.sleep(1)
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


def extract_with_retry(driver, url):
    """带重试机制的提取函数：失败时等待20s，刷新后再等10s"""
    result = extract_project_info(driver, url)
    
    if result['项目名称'] and '[' not in result['项目名称']:
        return result
    
    print(f"  [重试] 提取失败，等待 {CONFIG['retry_wait']}s 后重试...")
    time.sleep(CONFIG['retry_wait'])
    
    print(f"  [刷新] 刷新页面...")
    try:
        driver.refresh()
    except:
        pass
    
    print(f"  [等待] 刷新后等待 {CONFIG['refresh_wait']}s...")
    time.sleep(CONFIG['refresh_wait'])
    
    result = extract_project_info(driver, url)
    if result['项目名称'] and '[' not in result['项目名称']:
        print(f"  [重试成功] 刷新后提取成功")
    else:
        print(f"  [重试失败] 刷新后仍然失败")
    
    return result


def connect_to_chrome():
    """连接到已有的Chrome（调试模式）"""
    options = Options()
    options.add_experimental_option("debuggerAddress", f"127.0.0.1:{CONFIG['debug_port']}")
    
    chromedriver_path = check_and_download_chromedriver()
    
    if chromedriver_path and os.path.exists(chromedriver_path):
        print(f"\n[使用chromedriver] {chromedriver_path}")
        service = Service(executable_path=chromedriver_path)
        driver = webdriver.Chrome(service=service, options=options)
    else:
        print(f"\n[使用系统chromedriver]")
        driver = webdriver.Chrome(options=options)
    
    driver.set_page_load_timeout(CONFIG['page_timeout'])
    print("[连接成功] 已连接到现有Chrome")
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
        for line in source.split('\n'):
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
    print("一键更新表工具 v1.7".center(50))
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
        print("(提示：粘贴后链接会显示在一行，但程序会正确识别)")
        lines = []
        while True:
            line = input()
            if not line.strip():
                break
            lines.append(line)
        
        raw_text = '\n'.join(lines)
        raw_text = raw_text.replace('https://', '\nhttps://')
        links = read_links(raw_text)
    else:
        links = read_links(source)
    
    if not links:
        print("\n[错误] 未找到有效链接")
        return
    
    print(f"\n[连接Chrome] 正在连接到调试端口 {CONFIG['debug_port']}...")
    try:
        driver = connect_to_chrome()
    except SessionNotCreatedException as e:
        if "This version of ChromeDriver" in str(e):
            print(f"\n[版本错误] chromedriver 版本不匹配")
            print("[自动修复] 正在重新下载...")
            chromedriver_path = CONFIG['chromedriver_path']
            if os.path.exists(chromedriver_path):
                os.remove(chromedriver_path)
            try:
                driver = connect_to_chrome()
            except Exception as e2:
                print(f"\n[错误] {e2}")
                return
        else:
            print(f"\n[错误] {e}")
            return
    except WebDriverException as e:
        if "cannot connect" in str(e).lower() or "cannot find" in str(e).lower():
            print(f"\n[连接失败] 未找到调试模式的Chrome")
            print("\n请先运行 '启动Chrome调试模式.bat' 启动Chrome")
            return
        raise
    
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
                
                result = extract_with_retry(driver, url)
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
