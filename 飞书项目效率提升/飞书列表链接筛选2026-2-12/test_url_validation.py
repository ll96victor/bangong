#!/usr/bin/env python3
"""测试URL验证功能"""

from urllib.parse import urlparse

def is_valid_url(url):
    """验证URL格式是否有效"""
    try:
        parsed = urlparse(url)
        return all([parsed.scheme in ('http', 'https'), parsed.netloc])
    except Exception:
        return False

# 测试文件中的链接
test_links = [
    "https://project.feishu.cn/ml/onlineissue/detail/6751020785",
    "https://project.feishu.cn/ml/onlineissue/detail/6753356107",
    "https://project.feishu.cn/ml/onlineissue/detail/6753988641",
    "https://project.feishu.cn/ml/onlineissue/detail/6754837181",
    "https://project.feishu.cn/ml/onlineissue/detail/6779888973",
    "https://project.feishu.cn/ml/onlineissue/detail/6780426893",
    "https://project.feishu.cn/ml/onlineissue/detail/6780916728",
    "https://project.feishu.cn/ml/onlineissue/detail/6780661328",
    "https://project.feishu.cn/ml/onlineissue/detail/6780697077",
    "https://project.feishu.cn/ml/onlineissue/detail/6780543299",
    "https://project.feishu.cn/ml/onlineissue/detail/6780661328",
    "https://project.feishu.cn/ml/onlineissue/detail/6782909825"
]

print("测试URL验证功能:")
for i, link in enumerate(test_links, 1):
    is_valid = is_valid_url(link)
    print(f"{i:2d}. {link}")
    print(f"   有效性: {is_valid}")
    if not is_valid:
        parsed = urlparse(link)
        print(f"   解析结果: scheme='{parsed.scheme}', netloc='{parsed.netloc}'")
    print()