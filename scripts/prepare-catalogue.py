"""Generate additive SQL import files from a verified BeautyMarket snapshot. Never invent inventory."""
import json,sys,re,unicodedata
from pathlib import Path
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/workspace/catalogue-beautymarket')
repo=Path(__file__).resolve().parents[1]
ps=json.loads((source/'products.json').read_text());cs=json.loads((source/'collections.json').read_text());report=json.loads((source/'report.json').read_text())
assert not report['sitemap_products_missing'] and not report['sitemap_collections_missing']
def sql(v):
 if v is None:return 'NULL'
 if isinstance(v,int):return str(v)
 return "'"+str(v).replace("'","''").replace('\x00','')+"'"
def fold(s):return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn')
def category(p):
 text=fold(p['product_type']+' '+' '.join(c['title'] for c in p['collections']))
 for name,pattern in [('Solaires',r'solaire|soleil|spf|bronz'),('Bébé & Maman',r'bebe|maman|matern|allait'),('Cheveux',r'cheveu|capillaire|shampo|pellicul'),('Maquillage',r'maquillage|rouge a levres|mascara|fond de teint|blush|vernis'),('Visage',r'visage|acne|anti-age|contour des yeux'),('Corps',r'corps|corporel|douche|deodorant'),('Bien-être',r'complement|vitamine|bien-etre|nutrition|mineraux'),('Hygiène',r'hygiene|dentifrice|dentaire')]:
  if re.search(pattern,text):return name
 return 'Autres soins'
rows=[]
for p in ps:
 desc='\n'.join(line.rstrip() for line in p['description_text'].splitlines() if not re.search(r'beautymarket',line,re.I)).strip()
 for v in p['variants']:
  title=p['name'] if v['variant_name'] in (None,'Default Title') else p['name']+' — '+v['variant_name']
  assert v['price_centimes'] and v['price_centimes']>0
  images=p['images'];values=[title,p['brand'],category(p),desc,v['price_centimes'],images[0] if images else '',10,1,p['source_product_id'],v['source_variant_id'],p['source_url'],int(v.get('source_available') is True),json.dumps(images,ensure_ascii=False,separators=(',',':')),v.get('sku')]
  rows.append('INSERT INTO products(name,brand,category,description,price,image,stock,active,source_product_id,source_variant_id,source_url,source_available,images_json,sku) VALUES ('+','.join(map(sql,values))+') ON CONFLICT(source_variant_id) DO NOTHING;')
for i,start in enumerate(range(0,len(rows),3000),3):
 (repo/'catalogue-import'/f'{i:04}_catalogue_products.sql').write_text('-- Verified catalogue snapshot. Initial stock is 10 per format; preserve existing source IDs.\n'+'\n'.join(rows[start:start+3000])+'\n')
num=3+(len(rows)+2999)//3000
lines=[]
for c in cs:
 vals=[str(c['id']),c['handle'],c['title'],(c.get('image')or{}).get('src','')]
 lines.append('INSERT INTO collections(id,handle,title,image) VALUES ('+','.join(map(sql,vals))+') ON CONFLICT(id) DO NOTHING;')
for p in ps:
 for c in p['collections']:lines.append('INSERT OR IGNORE INTO product_collections(source_product_id,collection_id) VALUES ('+sql(p['source_product_id'])+','+sql(c['id'])+');')
(repo/'catalogue-import'/f'{num:04}_catalogue_collections.sql').write_text('\n'.join(lines)+'\n')
manifest={'source':'https://beautymarket.ma','snapshot_at_utc':report['raw_capture_last_at_utc'],'source_products':len(ps),'sellable_formats':len(rows),'collections':len(cs),'relationships':sum(len(p['collections']) for p in ps),'initial_stock':10,'automatic_price_sync':False,'images':'External HTTPS source URLs','missing_images':report['products_without_images']}
(repo/'catalogue-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
