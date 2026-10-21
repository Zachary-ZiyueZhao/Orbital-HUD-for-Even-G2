# iPhone 本地语音识别可行性 · 0.1.40

## 结论

iPhone 有真正的本地语音识别方案，可消除识别服务的公网往返。当前 ORBITAL HUD 是运行在 Even App 内的网页插件；项目使用的 SDK 0.0.16 提供麦克风 PCM 和显示接口，没有 Apple Speech／SpeechAnalyzer 的原生桥接。因此本版保留现有实时转写，没有把未接入的原生能力添加成可选项，也没有下载本地识别模型。

本地处理有机会改善延迟波动，但不能仅凭“离线”保证所有设备、语言、噪声和重复词都在词结束后一秒准确跟随。眼镜音频送到手机、解码器输出 partial、本地定位和回传眼镜仍有各自耗时；同义改写的语义判断也不会自动变成离线。

## 可行路径

### 1. Apple 原生 SpeechAnalyzer / SpeechTranscriber

iOS 26 引入的 SpeechAnalyzer 可在设备上处理输入音频；SpeechTranscriber 的 progressiveTranscription 预设支持快速、可修改的中间结果。原生端可按音频缓冲输入并处理增量文本，需要检查机型、系统、语言和模型资源。较早的 SFSpeechRecognizer 也有 requiresOnDeviceRecognition，但只有 supportsOnDeviceRecognition 成立才能保证按该设置本地处理。

要在现有插件里使用，需要 Even App 暴露相应的原生桥接，或另做可接收眼镜 PCM 的 iOS 原生配套应用。当前插件无法直接调用 Swift 框架；单独在另一个 App 打开识别，也不会自动收到 Even App 内的眼镜音频。不能假定 Safari 的 Web Speech 接口等价于此原生本地能力。

来源：[Apple SpeechAnalyzer 介绍](https://developer.apple.com/videos/play/wwdc2025/277/)、[渐进转写预设](https://developer.apple.com/documentation/speech/speechtranscriber/preset/progressivetranscription)、[强制本地识别](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)。

### 2. 网页内的本地流式模型

可以研究 sherpa-onnx 的 WebAssembly 流式 Zipformer／Paraformer，把当前 SDK 已提供的眼镜 PCM 送进网页工作线程。这条路能保留眼镜麦克风和当前显示逻辑，同时保留现有云端模式作为可选项。

需要在手机首次下载并缓存识别模型和 WASM，处理模型版本、语言、内存、热量和 WebView 兼容性。项目官方有浏览器实时识别示例，但不能据此承诺特定 iPhone／Even App 的性能；官方一个双语构建示例的数据文件约 199MB，实际大小随模型变化。还需确认 Even App 对模型文件缓存及 WebAssembly 的限制。本版没有将这些外部模型加入安装包。

来源：[sherpa-onnx WebAssembly](https://k2-fsa.github.io/sherpa/onnx/wasm/index.html)、[官方浏览器示例](https://k2-fsa.github.io/sherpa/onnx/wasm/hf-spaces.html)、[构建和资源示例](https://k2-fsa.github.io/sherpa/onnx/wasm/build.html)。

## 当前改动

按本次优先事项，0.1.40 改善显示连续性：固定阅读焦点、下一行预亮、旧行渐暗、迟到结果逐行交接，保留现有实时识别和 Immediate 显示模式。详见 [Teleprompt](teleprompt.md)。未用用户 Key 发起付费请求，未实测本地模型或宣称一秒内识别。
