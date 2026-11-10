# Checkpoints

Model configurations and DUACS 1993–2016 normalisation statistics are available in [`../configs`](../configs), and the SHA-256 digests of all exported [safetensors](https://github.com/huggingface/safetensors) checkpoint shards are recorded in [`SHA256SUMS.txt`](SHA256SUMS.txt).

> **Status:** Open-weight checkpoint files (`safetensors`) will be attached as public release assets soon.

| Checkpoint | Model | Parameters | Precision | Files | Size | Status |
|---|---|---:|:---:|---|---:|:---:|
| **HaiRuo-1B** | Pretrained foundation backbone ($0.5^\circ$ tokens, 93 epochs on 1993–2016) | 1.05 B | `fp32` | `hairuo_1b_pretrained.safetensors.index.json` + 3 shards | 4.2 GB | *Coming soon* |
| **HaiRuo** (backbone) | HaiRuo-1B fine-tuned jointly with XuanJi (seed 42) | 1.05 B | `bf16` | `hairuo_1b_finetuned_xuanji_bf16.safetensors.index.json` + 2 shards | 2.1 GB | *Coming soon* |
| **HaiRuo** (decoder) | XuanJi decoder of HaiRuo (seed 42) | 7.85 M | `fp32` | `xuanji_decoder_hairuo_s42.safetensors` | 31 MB | *Coming soon* |
| **XuanJi** (frozen 1B) | Decoder trained on frozen pretrained HaiRuo-1B (seed 42) | 7.85 M | `fp32` | `xuanji_decoder_frozen_hairuo_1b_s42.safetensors` | 31 MB | *Coming soon* |
| **HaiRuo-200M** | Pretrained backbone ($1.0^\circ$ tokens, 22 epochs) | 229 M | `fp32` | `hairuo_200m_pretrained.safetensors` | 0.9 GB | *Coming soon* |
