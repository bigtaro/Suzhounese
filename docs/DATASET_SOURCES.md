# 苏州话语料检索清单

> 日期：2026-11-20  
> 状态：当前执行环境无法访问外网，以下链接和平台需要你在浏览器中打开后核对最新可用性、许可证和下载条件。

## 1. 先说结论

目前没有广泛知名、可直接下载的 50–100 小时“纯开源苏州话 ASR 数据集”。更常见的情况是：

- 通用中文/普通话开源数据集很多，但不包含苏州话。
- 吴语或苏州话数据多为高校、研究机构或商业数据商持有，需要学术申请或采购。
- 公开平台上可能有小规模苏州话片段，但通常不足 50 小时，且许可证需要逐项确认。

因此，建议把“找现成 50–100 小时数据”拆成：

1. 先找 10–50 小时的苏州话/吴语授权数据。
2. 用通用普通话数据做回放，防止模型遗忘。
3. 用无标注苏州话音频做伪标注和自训练。
4. 不足部分通过自采补齐。

## 2. 搜索关键词

在下面各平台搜索这些词，中英文都试：

```text
Suzhou dialect
Suzhou Chinese
Suzhou speech corpus
Wu Chinese
Wu dialect
苏州话
苏州方言
吴语
吴语语音语料
```

## 3. 优先检索的开放数据平台

| 平台 | 检索入口 | 注意事项 |
|---|---|---|
| Hugging Face Datasets | `huggingface.co/datasets?search=suzhou` | 逐个查看 dataset card 的 license 和 audio/transcript 字段 |
| Hugging Face 吴语检索 | `huggingface.co/datasets?search=wu%20chinese` | `Wu` 也可能指其他含义，需听样本确认 |
| ModelScope | `modelscope.cn/datasets?search=苏州话` | 可能需要登录；许可证和是否可商用要单独看 |
| OpenSLR | `openslr.org` | 每个 corpus 的许可证不同，不要默认全部可商用 |
| OpenDataLab | `opendatalab.com` | 搜索苏州话、吴语、方言语音 |
| 百度 AI Studio | `aistudio.baidu.com/datasetoverview` | 搜索苏州话/吴语，注意数据集作者和授权 |
| 阿里天池 | `tianchi.aliyun.com/dataset/` | 搜索苏州话/方言，注意比赛数据是否允许再分发 |
| Zenodo | `zenodo.org/search?q=suzhou%20dialect` | 学术数据多，许可证可能是 CC BY 或 CC BY-NC |
| OSF | `osf.io/search?q=suzhou%20dialect` | 以论文附件和补充材料为主 |
| Kaggle | `kaggle.com/datasets?search=suzhou` | 许可证差异很大，需看原始来源 |

## 4. 可授权/商业数据商

这些平台不一定是“开源”，但可能有苏州话、吴语或中文方言包：

| 平台 | 入口 | 说明 |
|---|---|---|
| LDC | `catalog.ldc.upenn.edu` | 搜索 Suzhou、Wu、Chinese dialect；通常需要许可证或会员 |
| ELRA | `catalog.elra.info` | 欧洲语言资源目录，可能有中文方言资源 |
| MagicData | `magicdatatech.com` | 中文语音数据商，询问苏州话/吴语包 |
| SpeechOcean | `speechocean.com` | 中文方言采集和授权数据 |

联系数据商时直接问这五项：总时长、说话人数、是否有逐句转写、方言点、是否允许商用和模型再分发。

## 5. 学术机构方向

可以联系做方言学、语音识别或语音语料库的团队，申请学术授权或合作：

- 苏州大学相关方言/语言研究团队。
- 复旦大学中文系及吴语研究团队。
- 上海大学中文系/语言研究团队。
- 中国社会科学院语言研究所方言研究室。
- 苏州本地图书馆、档案馆、地方志机构的口述历史项目。

学术语料常见限制是“仅限研究、不可再分发”，用于训练模型前要确认模型权重是否允许发布。

## 6. 可作为普通话回放的公开数据集

这些不是苏州话数据，不能直接解决方言识别，但可以混入训练，降低模型遗忘普通话：

| 数据集 | 入口 | 用途/注意 |
|---|---|---|
| Mozilla Common Voice | `commonvoice.mozilla.org/datasets` | 通常为 CC0，但主要是普通话/粤语等，不要假设有苏州话 |
| AISHELL-1 | `openslr.org/33/` | 普通话，适合回放和基线 |
| THCHS-30 | `openslr.org/18/` | 普通话，适合快速验证训练管线 |
| WenetSpeech | `github.com/wenet-e2e/WenetSpeech` | 大规模普通话，需按仓库/申请页核对许可证 |
| KeSpeech | `github.com/KeSpeech/KeSpeech` | 中文方言数据，但不是吴语/苏州话，许可证需核对 |
| FLEURS | `huggingface.co/datasets/google/fleurs` | 多语种，含普通话/粤语，不等于苏州话 |

## 7. 下载前检查清单

- 许可证是 CC0、CC BY、CC BY-NC、Apache、研究许可还是商业许可。
- 是否允许训练模型、发布模型权重、商用和再分发。
- 音频总时长、有效语音时长、说话人数和每人时长。
- 是否有逐句转写，转写是汉字、普通话翻译还是拼音/IPA。
- 方言点是否为苏州城区，是否包含吴江、昆山、常熟等口音。
- 录音是朗读还是自然对话，是否包含老年人、噪声和混说。
- 音频采样率、格式、是否有切分和说话人标注。
- 数据来源是否可追溯，是否包含个人信息。

## 8. 建议的检索顺序

1. 先在 Hugging Face、ModelScope、OpenSLR 搜苏州话/吴语，确认是否有可直接下载的小包。
2. 再查 OpenDataLab、AI Studio、天池、Zenodo、OSF。
3. 同步联系 LDC、ELRA、MagicData、SpeechOcean 询问可授权数据。
4. 联系高校和本地机构申请学术授权。
5. 仍然不足的部分，用自采和伪标注补齐。

找到候选数据集后，把链接、许可证、时长和转写格式发给我，我可以继续做下载校验、清单生成和训练集切分。

