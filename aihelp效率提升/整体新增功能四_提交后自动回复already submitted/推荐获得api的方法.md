



好，我已经拿到了完整的调用细节，下面给你写一份从零开始的手把手教程，专门针对翻译脚本场景。

---

## **智谱 GLM-4-Flash API 调用手把手教程（小白版）**

### **第一步：注册并获取 API Key**

打开 [智谱 AI 开放平台](https://open.bigmodel.cn/)，用手机号注册并登录。登录后进入右上角「个人中心」→「API Keys」，点击「新建 API Key」，复制生成的 Key 保存好。Key 的格式长这样：

```
xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx
```

注意这个 Key 是你的身份凭证，不要泄露给别人。

---

### **第二步：安装 Python 依赖**

你只需要一个最基础的 `requests` 库就能调用，大概率你的电脑已经有了。打开终端（Windows 用 CMD 或 PowerShell），运行：

```bash
pip install requests
```

如果你想用官方 SDK（更简洁），也可以额外安装：

```bash
pip install zhipuai
```

---

### **第三步：写翻译脚本**

下面提供两种方式，任选其一。

#### **方式 A：用 requests 直接调用（最轻量，推荐小白）**

新建一个 `translate.py` 文件，把下面代码粘进去：

```python
import requests

API_KEY = "这里填你的API Key"  # 替换成你自己的

def translate(text, target_lang="中文"):
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    data = {
        "model": "glm-4-flash",
        "messages": [
            {
                "role": "system",
                "content": f"你是一个专业翻译，请将用户输入的内容翻译成{target_lang}，只输出译文，不要解释。"
            },
            {
                "role": "user",
                "content": text
            }
        ],
        "temperature": 0.3  # 翻译任务建议低温，结果更稳定
    }
    response = requests.post(url, headers=headers, json=data)
    result = response.json()
    return result["choices"][0]["message"]["content"]

# 测试一下
print(translate("Hello, how are you today?"))
print(translate("人工智能正在改变世界。", target_lang="English"))
```

运行方式：在终端输入 `python translate.py`，正常的话会直接输出翻译结果。

---

#### **方式 B：用官方 SDK（代码更简洁）**

```python
from zhipuai import ZhipuAI

client = ZhipuAI(api_key="这里填你的API Key")

def translate(text, target_lang="中文"):
    response = client.chat.completions.create(
        model="glm-4-flash",
        messages=[
            {
                "role": "system",
                "content": f"你是一个专业翻译，请将用户输入的内容翻译成{target_lang}，只输出译文，不要解释。"
            },
            {
                "role": "user",
                "content": text
            }
        ],
        temperature=0.3
    )
    return response.choices[0].message.content

print(translate("The quick brown fox jumps over the lazy dog."))
```

两种方式效果完全一样，SDK 写法更简短，requests 方式不依赖额外库。

---

### **第四步：把 API Key 存到文件里（安全习惯）**

不建议把 Key 直接写在代码里，特别是代码要分享或上传的时候。推荐新建一个 `key.txt` 文件，把 Key 单独存进去：

```
xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx
```

然后在代码里改成这样读取：

```python
with open("key.txt", "r") as f:
    API_KEY = f.read().strip()
```

---

### **常见问题**

**报错 `401 Unauthorized`**：API Key 填错了，或者复制时带了多余的空格，检查一下。

**返回内容不是纯译文，带了多余解释**：可以在 system prompt 里加强指令，比如改成「只输出译文，不要输出任何其他内容，不要加引号」。

**调用速度慢**：GLM-4-Flash 本身响应很快，如果慢通常是网络问题，国内访问 `open.bigmodel.cn` 是直连的，不需要代理。

**免费额度够用吗**：完全够。每天几十次翻译调用，每次翻译文本也就几百字，一个月下来消耗的 Token 量远远低于免费上限，基本可以认为永久免费使用。[智谱AI开放平台](https://open.bigmodel.cn/)