# -*- coding: utf-8 -*-
"""Временная копия rov.html: после загрузки заменяет содержимое отчётом
о элементах, вылезающих за правую границу экрана (список виден на скриншоте,
т.к. dump-dom игнорирует --window-size, а скриншот — нет)."""
h = open('rov.html', encoding='utf-8').read()
probe = (
    '<script>\n'
    'addEventListener("load",function(){setTimeout(function(){\n'
    '  var W=document.documentElement.clientWidth,arr=[];\n'
    '  document.querySelectorAll("*").forEach(function(el){\n'
    '    var r=el.getBoundingClientRect();\n'
    '    if(r.width&&r.right>W+1){\n'
    '      var c=el.className;\n'
    '      c=(c&&c.baseVal!==undefined)?c.baseVal:String(c||"");\n'
    '      arr.push([Math.round(r.right-W),el.tagName.toLowerCase()+(c?"."+c.trim().split(/\\s+/).slice(0,5).join("."):"")]);\n'
    '    }\n'
    '  });\n'
    '  arr.sort(function(a,b){return b[0]-a[0]});\n'
    '  var lines=["viewport W="+W+"  scrollWidth="+document.documentElement.scrollWidth];\n'
    '  arr.slice(0,25).forEach(function(x){lines.push("+"+x[0]+"px  "+x[1])});\n'
    '  document.body.innerHTML="<pre style=\\"font:12px monospace;padding:16px;color:#000;background:#fff\\">"+lines.join("\\n").replace(/&/g,"&amp;").replace(/</g,"&lt;")+"</pre>";\n'
    '  document.title="done";\n'
    '},500)});\n'
    '</script>\n</body>'
)
h = h.replace('</body>', probe, 1)
open('_measure.html', 'w', encoding='utf-8', newline='').write(h)
print('ok _measure.html')
