# Builds photocraft-clone/index.html from the original SSR page.
$ErrorActionPreference = "Stop"
$ref = $PSScriptRoot
$out = Split-Path $ref -Parent
$origin = "https://getartcraft.com"

$html = Get-Content -Raw -Encoding UTF8 "$ref\page.html"

# --- html tag attributes (font variables live in its class list) ---
$htmlTag = [regex]::Match($html, '<html[^>]*>').Value

# --- body inner ---
$body = [regex]::Match($html, '<body>(.*)</body>', [System.Text.RegularExpressions.RegexOptions]::Singleline).Groups[1].Value

# drop every script except JSON-LD
$body = [regex]::Replace($body, '<script(?![^>]*application/ld\+json)[^>]*>.*?</script>', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
# drop next/react comments
$body = $body -replace '<!--\$?/?-->', ''

# absolute URLs for site-local assets and links (in-page "#..." anchors untouched)
$body = [regex]::Replace($body, '(?<=\ssrc=")/(?!/)', "$origin/")
$body = [regex]::Replace($body, '(?<=\shref=")/(?!/)', "$origin/")

# --- desktop "Resources" dropdown (rendered by Radix only at runtime) ---
$resources = @'
<div id="resources-menu" class="absolute top-full left-0 hidden border border-t-0 border-line bg-bg"><ul class="flex min-w-[200px] flex-col"><li><a class="group flex px-3 py-2.5 hud-label whitespace-nowrap text-muted hover:text-ink" href="https://getartcraft.com/tutorials"><span class="flex items-center gap-1.5 px-1.5 py-0.5 group-hover:bg-invert-bg group-hover:text-invert-fg">Tutorials</span></a></li><li><a class="group flex px-3 py-2.5 hud-label whitespace-nowrap text-muted hover:text-ink" href="https://getartcraft.com/news"><span class="flex items-center gap-1.5 px-1.5 py-0.5 group-hover:bg-invert-bg group-hover:text-invert-fg">News</span></a></li><li><a class="group flex px-3 py-2.5 hud-label whitespace-nowrap text-muted hover:text-ink" href="https://getartcraft.com/faq"><span class="flex items-center gap-1.5 px-1.5 py-0.5 group-hover:bg-invert-bg group-hover:text-invert-fg">FAQ</span></a></li><li><a class="group flex px-3 py-2.5 hud-label whitespace-nowrap text-muted hover:text-ink" href="https://getartcraft.com/press-kit"><span class="flex items-center gap-1.5 px-1.5 py-0.5 group-hover:bg-invert-bg group-hover:text-invert-fg">Press Kit</span></a></li></ul></div>
'@ -replace "`r`n", ""

$m = [regex]::Match($body, '<button[^>]*data-state="closed"[^>]*>.*?</button>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
if (-not $m.Success) { throw "Resources trigger not found" }
$tag = $m.Value
$tag = $tag -replace '^<button', '<button id="resources-trigger"'
$end = $m.Index + $m.Length
$body = $body.Remove($m.Index, $m.Length).Insert($m.Index, $tag + $resources)

# --- mobile menu (Radix sheet rendered only at runtime) ---
function NavItem([string]$href, [string]$label) {
    "<li><a class=`"group flex items-center border-b border-line px-4 py-3 hud-label whitespace-nowrap text-muted hover:text-ink`" href=`"$href`"><span class=`"flex items-center gap-1.5 px-1.5 py-0.5 group-hover:bg-invert-bg group-hover:text-invert-fg`">$label</span></a></li>"
}
$mobile = '<div id="mobile-nav" class="hidden border-b border-line bg-bg lg:hidden"><ul>' +
    (NavItem "$origin/" "Home") +
    (NavItem "https://app.getartcraft.com/create-image" "Image") +
    (NavItem "https://app.getartcraft.com/create-video" "Video") +
    (NavItem "$origin/tutorials" "Tutorials") +
    (NavItem "$origin/news" "News") +
    (NavItem "$origin/faq" "FAQ") +
    (NavItem "$origin/press-kit" "Press Kit") +
    (NavItem "$origin/download" "Download") +
    (NavItem "$origin/support" "Support") +
    (NavItem "$origin/apps" "Craft Apps") +
    (NavItem "$origin/pricing" "Pricing") +
    '</ul><div class="flex"><a class="inline-flex flex-1 items-center justify-center gap-2 border-t border-line bg-invert-bg px-5 py-3 font-mono text-[11px] font-bold tracking-[0.12em] text-invert-fg uppercase" href="https://app.getartcraft.com/">Launch App</a><a href="https://discord.gg/artcraft" target="_blank" rel="noopener noreferrer" aria-label="Join the ArtCraft Discord" class="flex w-12 items-center justify-center border-t border-l border-line text-muted hover:bg-invert-bg hover:text-invert-fg"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="h-4 w-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"></path></svg></a></div></div>'

$anchor = '</nav><main id="main">'
$pos = $body.IndexOf($anchor)
if ($pos -lt 0) { throw "header/main anchor not found" }
$body = $body.Insert($pos, $mobile)

# --- OS-specific launcher captions (React fills them client-side) ---
$captionRe = '<span aria-hidden="true" class="hud-label min-h-4 w-0 min-w-full whitespace-nowrap text-faint">[^<]*</span>'
$captionNew = '<span aria-hidden="false" class="hud-label min-h-4 w-0 min-w-full whitespace-nowrap text-faint" data-os-caption></span>'
$body = [regex]::Replace($body, $captionRe, $captionNew)
$captionCount = [regex]::Matches($body, [regex]::Escape($captionNew)).Count
if ($captionCount -ne 2) { throw "expected 2 launcher captions, found $captionCount" }

# --- "Other platforms and downloads" link in the hero ---
$platformsLink = '<a href="#get-it" class="hud-label flex items-center gap-1.5 text-muted hover:text-ink">Other platforms and downloads<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down h-3.5 w-3.5" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg></a>'
$anchorP = '<p class="hud-label text-faint">macOS'
$pos = $body.IndexOf($anchorP)
if ($pos -lt 0) { throw "hero platform line not found" }
$body = $body.Insert($pos, $platformsLink)

# --- head ---
$head = @"
<!DOCTYPE html>
$htmlTag
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>PhotoCraft: The image editor you already know how to use. - ArtCraft</title>
<meta name="description" content="Layers, masks, adjustment layers, layer styles, type, vectors and brushes in a native app written entirely in Rust. Open source, offline, and yours."/>
<meta name="theme-color" content="#f2f1ee" media="(prefers-color-scheme: light)"/>
<meta name="theme-color" content="#0b0b0c" media="(prefers-color-scheme: dark)"/>
<meta property="og:title" content="PhotoCraft: The image editor you already know how to use."/>
<meta property="og:description" content="The open-source image editor you already know how to use."/>
<meta property="og:url" content="https://getartcraft.com/apps/photocraft"/>
<meta property="og:site_name" content="ArtCraft"/>
<meta property="og:image" content="https://getartcraft.com/images/apps/photocraft/og.jpg"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="PhotoCraft editing The Great Wave off Kanagawa with a Curves adjustment and type layers in the Layers panel"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="PhotoCraft: The image editor you already know how to use."/>
<meta name="twitter:description" content="The open-source image editor you already know how to use."/>
<meta name="twitter:image" content="https://getartcraft.com/images/apps/photocraft/og.jpg"/>
<link rel="icon" href="$origin/artcraft-icon.svg"/>
<link rel="stylesheet" href="style.css"/>
<link rel="stylesheet" href="clone.css"/>
<script>document.documentElement.classList.add('js');</script>
<script src="clone.js" defer></script>
</head>
<body>
"@

$page = $head + $body + "</body>`n</html>`n"
[System.IO.File]::WriteAllText("$out\index.html", $page, [System.Text.UTF8Encoding]::new($false))
Write-Output ("index.html written: " + $page.Length + " chars")

# --- style.css: original bundle with local font paths ---
$css = Get-Content -Raw -Encoding UTF8 "$ref\site.css"
$css = $css -replace 'url\(\.\./media/', 'url(fonts/'
[System.IO.File]::WriteAllText("$out\style.css", $css, [System.Text.UTF8Encoding]::new($false))
Write-Output ("style.css written: " + $css.Length + " chars")
