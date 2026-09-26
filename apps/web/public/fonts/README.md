# Terminal 字型

Terminal、輸出預覽與相關 monospace controls 使用 **JetBrainsMono Nerd Font Mono**。Mono 變體讓 Nerd Font 圖示維持單格寬度。

- 來源：[Nerd Fonts v3.5.1 / JetBrainsMono.zip](https://github.com/ryanoasis/nerd-fonts/releases/download/v3.5.1/JetBrainsMono.zip)
- ZIP SHA-256：`fab782a66f7d3019da64f6572db9fc5d3a4bcb19f9fa13e2d8a62e3693d6396e`
- 上游 JetBrains Mono 版本：2.304。
- 使用 `JetBrainsMonoNerdFontMono-{Regular,SemiBold,Italic,SemiBoldItalic}.ttf`，對應 400／600 weight 與 normal／italic。
- WOFF2 保留完整 12,226 個 Unicode mappings，不做 subset、不修改 glyph 或 metrics。四個檔案合計約 4.14 MiB；網站本地提供，不需存取 GitHub 或安裝系統字型。
- CSS family 使用 `JetBrainsMono Nerd Font Mono`；TTF 內部 family 的縮寫為 `JetBrainsMono NFM`。
- JetBrains Mono 授權：[`JETBRAINS-MONO-OFL.txt`](JETBRAINS-MONO-OFL.txt)。
- Nerd Fonts 授權：[`NERD-FONTS-LICENSE.txt`](NERD-FONTS-LICENSE.txt)。
- 上游版本、圖示來源與授權表：[`JETBRAINS-MONO-NERD-FONTS-README.md`](JETBRAINS-MONO-NERD-FONTS-README.md)，原樣取自 ZIP。

## 重新產生

在 repository root 執行。先下載 ZIP 至 `/tmp/herdr-jetbrainsmono-v3.5.1.zip` 並確認 SHA-256，再轉換：

```bash
uv run --with 'fonttools[woff]==4.59.2' python - <<'PY'
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
from fontTools.ttLib import TTFont

with ZipFile('/tmp/herdr-jetbrainsmono-v3.5.1.zip') as archive:
    for style in ['Regular', 'SemiBold', 'Italic', 'SemiBoldItalic']:
        font = TTFont(BytesIO(archive.read(f'JetBrainsMonoNerdFontMono-{style}.ttf')))
        cmap = font.getBestCmap()
        font.flavor = 'woff2'
        target = Path('public/fonts') / f'jetbrains-mono-nerd-font-mono-v3.5.1-{style.lower()}.woff2'
        font.save(target)
        converted = TTFont(target)
        assert converted.getBestCmap() == cmap
        for char in 'Ag\ue0b0\uf489\U000f02a2':
            assert converted['hmtx'][cmap[ord(char)]][0] == converted['hmtx'][cmap[ord('A')]][0]
PY
```

執行 `npm run build && npm run check:font-assets` 確認四個 WOFF2 與授權文件原樣打包，且不再包含舊 Terminal 字型。
