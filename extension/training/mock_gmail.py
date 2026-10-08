"""Builds a static page that reproduces Gmail's inbox DOM (tr.zA rows, .bog subject,
.y2 snippet, span[email] sender, h2.hP + div.a3s for an opened mail) so the
extension can be tested end-to-end with Playwright. Usage: python3 mock_gmail.py out.html"""
import json, sys, html, os

HERE = os.path.dirname(os.path.abspath(__file__))
cases = json.load(open(os.path.join(HERE, "realistic_test.json")))
order = [0, 20, 8, 38, 27, 9, 1, 21, 10, 39, 28, 35, 11, 40, 2, 22, 12, 29, 3, 13, 23, 30, 14, 36, 4, 15, 31, 24, 16, 5, 17, 32, 25, 18, 6, 33, 19, 26, 7, 34, 37]
order += [i for i in range(len(cases)) if i not in order]
mails = [cases[i] for i in order]
times = ["11:42 AM", "11:05 AM", "10:31 AM", "9:58 AM", "9:12 AM", "8:47 AM", "8:02 AM", "7:30 AM"] + [f"Oct {8 - i // 6}" for i in range(6, 60)]

rows = []
for i, m in enumerate(mails):
    unread = " zE" if i % 3 != 2 else " yO"
    rows.append(f"""<tr class="zA{unread}" id=":r{i}" data-i="{i}" tabindex="-1">
<td class="oZ-x3 xY"><div class="cb"></div></td><td class="apU xY"><span class="star">☆</span></td>
<td class="yX xY"><div class="yW"><span class="bA4"><span class="{'zF' if 'zE' in unread else 'yP'}" email="{html.escape(m['email'])}" name="{html.escape(m['from'])}">{html.escape(m['from'])}</span></span></div></td>
<td class="xY a4W"><div class="xS"><div class="xT"><div class="y6"><span class="bog"><span>{html.escape(m['subject'])}</span></span></div><span class="y2"> - {html.escape(m['text'])}</span></div></div></td>
<td class="xW xY"><span>{times[i]}</span></td></tr>""")

page = """<!doctype html><html><head><meta charset="utf-8"><title>Inbox (%d) - shivang@gmail.com - Gmail</title>
<style>
*{box-sizing:border-box} body{margin:0;font:14px Roboto,Arial,sans-serif;color:#202124;background:#f6f8fc;height:100vh;overflow:hidden}
.top{height:64px;display:flex;align-items:center;gap:16px;padding:0 16px}
.logo{display:flex;align-items:center;gap:8px;width:220px;font-size:22px;color:#5f6368}
.logo b{display:inline-block;width:40px;height:30px;background:linear-gradient(135deg,#ea4335 0 30%%,#fbbc04 30%% 50%%,#34a853 50%% 70%%,#4285f4 70%%);clip-path:polygon(0 0,50%% 45%%,100%% 0,100%% 100%%,0 100%%);border-radius:3px}
.search{flex:1;max-width:720px;height:48px;border-radius:24px;background:#eaf1fb;display:flex;align-items:center;padding:0 20px;color:#5f6368}
.av{margin-left:auto;width:32px;height:32px;border-radius:50%%;background:#7b1fa2;color:#fff;display:grid;place-items:center;font-weight:500}
.wrap{display:flex;height:calc(100vh - 64px)}
.nav{width:256px;padding:8px 0 0 8px}
.compose{display:inline-flex;align-items:center;gap:12px;height:56px;padding:0 24px 0 18px;border-radius:16px;background:#c2e7ff;font-weight:500;margin:0 0 16px 0}
.nav a{display:flex;justify-content:space-between;height:32px;align-items:center;padding:0 12px 0 26px;border-radius:0 16px 16px 0;color:#202124;text-decoration:none;margin-right:16px}
.nav a.on{background:#d3e3fd;font-weight:700}
.main{flex:1;background:#fff;border-radius:16px;margin:0 16px 16px 0;overflow:auto;position:relative}
.tb{height:48px;display:flex;align-items:center;padding:0 16px;color:#5f6368;gap:20px;border-bottom:1px solid #f1f1f1}
.tabs{display:flex;border-bottom:1px solid #f1f1f1}.tabs div{width:250px;padding:16px;color:#5f6368}.tabs .on{color:#0b57d0;border-bottom:3px solid #0b57d0;font-weight:500}
table.F{width:100%%;border-collapse:collapse;table-layout:fixed}
tr.zA{height:40px;border-bottom:1px solid #f1f3f4;cursor:pointer;background:#f2f6fc}
tr.zA.zE{background:#fff;font-weight:700} tr.zA:hover{box-shadow:inset 1px 0 0 #dadce0,inset -1px 0 0 #dadce0,0 1px 2px rgba(60,64,67,.3)}
td.xY{white-space:nowrap;overflow:hidden;padding:0 4px}
td.oZ-x3{width:36px;padding-left:14px}.cb{width:14px;height:14px;border:2px solid #b0b4b8;border-radius:2px}
td.apU{width:30px;color:#b0b4b8}td.yX{width:200px}td.xW{width:90px;text-align:right;padding-right:16px;font-size:12px}
.xT{display:flex;overflow:hidden}.y6{flex:none;max-width:60%%;overflow:hidden;text-overflow:ellipsis}.y2{color:#5f6368;font-weight:400;overflow:hidden;text-overflow:ellipsis}
.view{padding:20px 64px}h2.hP{font-size:22px;font-weight:400;margin:6px 0 18px}
.from{display:flex;gap:12px;align-items:center;margin-bottom:14px}.from .pic{width:40px;height:40px;border-radius:50%%;background:#e8710a}
.gD{font-weight:700}.a3s{font-size:14px;line-height:1.6;max-width:760px}
</style></head><body>
<div class="top"><div class="logo"><b></b>Gmail</div><div class="search">🔍&nbsp;&nbsp; Search mail</div><div class="av">S</div></div>
<div class="wrap"><div class="nav"><div class="compose">✎ Compose</div>
<a class="on" href="#inbox"><span>Inbox</span><span>%d</span></a><a href="#starred">Starred</a><a href="#snoozed">Snoozed</a><a href="#sent">Sent</a><a href="#drafts">Drafts</a><a href="#spam">Spam</a></div>
<div class="main" role="main" id="main">
<div id="list"><div class="tb">☐ ▾ &nbsp; ⟳ &nbsp; ⋮ <span style="margin-left:auto;font-size:12px">1–%d of 2,481</span></div>
<div class="tabs"><div class="on">Primary</div><div>Promotions</div><div>Social</div><div>Updates</div></div>
<table class="F cf zt"><tbody>%s</tbody></table></div>
<div id="open" class="view" hidden></div>
</div></div>
<script>
const M=%s;
function route(){
  const m=location.hash.match(/^#inbox\\/(\\d+)/); const list=document.getElementById('list'), op=document.getElementById('open');
  if(!m){list.hidden=false;op.hidden=true;op.textContent='';return;}
  const x=M[+m[1]]; list.hidden=true; op.hidden=false; op.textContent='';
  const h2=document.createElement('h2'); h2.className='hP'; h2.textContent=x.subject;
  const adn=document.createElement('div'); adn.className='adn';
  const fr=document.createElement('div'); fr.className='from';
  const pic=document.createElement('div'); pic.className='pic';
  const g=document.createElement('span'); g.className='gD'; g.setAttribute('email',x.email); g.setAttribute('name',x.from); g.textContent=x.from;
  const em=document.createElement('span'); em.style.color='#5f6368'; em.textContent=' <'+x.email+'>';
  fr.append(pic,g,em);
  const body=document.createElement('div'); body.className='a3s aiL'; body.textContent=x.text;
  adn.append(fr,body); op.append(h2,adn);
}
document.querySelectorAll('tr.zA').forEach(tr=>tr.addEventListener('click',()=>location.hash='#inbox/'+tr.dataset.i));
addEventListener('hashchange',route); route();
</script></body></html>""" % (len(mails), len(mails), len(mails), "\n".join(rows), json.dumps(mails))

open(sys.argv[1], "w").write(page)
print("wrote", sys.argv[1], len(mails), "mails")
