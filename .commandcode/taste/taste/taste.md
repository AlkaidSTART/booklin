# Taste
- Writes in Chinese and expects replies in Chinese, even when linking English/technical sources. Confidence: 0.75
- Prefers iterative brainstorming dialogue: answers assistant questions point-by-point with short numbered replies ("1. ... 2. ...") and steers with brief directives like "可以" / "ok" / "继续" rather than long instructions. Confidence: 0.65
- Documentation-first: before implementing or finalizing a concept, wants background assets and world-building/design documents expanded ("先补充增加相关资产和世界观文档"), then keeps refining them together. Confidence: 0.65
- Readily supplies supporting business context and hard numbers (partner relationships, market data) when asked to ground a design discussion. Confidence: 0.55
- Treats the worldview/spec document as the source of truth: new business and interaction work should be derived from and consistent with it ("按照世界观文档补充业务和交互"), and the spec/copy docs are expected to stay in sync with the implementation. Confidence: 0.75
- Hands over terse one-line feature directives ("根据相关的文档，补充相关材质，完善相关网页内容") and expects the agent to locate the relevant docs, implement, verify, and summarize end-to-end without further back-and-forth. Confidence: 0.65
- Sets an explicit "确保高质量交付" quality bar: contribution is expected to be verified before being called done — builds and validation scripts pass, and the rendered result is checked (e.g. headless screenshots of each section) rather than assumed from code. Confidence: 0.65
