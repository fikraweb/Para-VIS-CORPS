import { categoryDefinitions } from './categories.js';
const fields='p.id,p.name,p.brand,p.category,p.price,p.image,p.stock,p.active,p.source_product_id,p.source_variant_id';
export async function catalogue(db,url,admin=false){
 const search=url.searchParams,where=[admin?'1=1':'p.active=1 AND p.price IS NOT NULL'],values=[];
 if(search.has('ids')){
  const ids=search.get('ids').split(',').filter(Boolean).map(Number);
  if(ids.length>50||ids.some(i=>!Number.isSafeInteger(i)||i<1))throw Error('Invalid product IDs');
  if(!ids.length)return [];
  where.push(`p.id IN (${ids.map(()=>'?').join(',')})`);values.push(...ids);
 }
 const q=(search.get('q')||'').trim().slice(0,150);
 if(q){where.push('(instr(lower(p.name),lower(?))>0 OR instr(lower(p.brand),lower(?))>0 OR instr(lower(COALESCE(p.sku,\'\')),lower(?))>0)');values.push(q,q,q);}
 const category=search.get('category');if(category&&category!=='Tous'){
 const definition=categoryDefinitions.find(c=>c.name===category);
 if(definition){
  const aliases=[definition.name,...(definition.aliases||[])];
  where.push(`((p.source_product_id IS NULL AND p.category IN (${aliases.map(()=>'?').join(',')})) OR EXISTS(SELECT 1 FROM product_collections pc JOIN collections c ON c.id=pc.collection_id WHERE pc.source_product_id=p.source_product_id AND c.handle IN (${definition.handles.map(()=>'?').join(',')})))`);
  values.push(...aliases,...definition.handles);
  if(definition.excludeSourceIds?.length){where.push(`(p.source_product_id IS NULL OR p.source_product_id NOT IN (${definition.excludeSourceIds.map(()=>'?').join(',')}))`);values.push(...definition.excludeSourceIds);}
 }else{where.push('p.category=?');values.push(category);}
 }
 const collection=search.get('collection');if(collection){where.push('EXISTS(SELECT 1 FROM product_collections pc JOIN collections c ON c.id=pc.collection_id WHERE pc.source_product_id=p.source_product_id AND c.handle=?)');values.push(collection);}
 const condition=where.join(' AND '),paginated=search.has('page');
 const limit=paginated?24:100;
 const total=paginated?(await db.prepare('SELECT COUNT(*) AS n FROM products p WHERE '+condition).bind(...values).first()).n:0;
 const pages=Math.max(1,Math.ceil(total/limit));const page=Math.min(pages,Math.max(1,Math.floor(Number(search.get('page'))||1)));
 const order=!admin&&paginated&&(!category||category==='Tous')?"(p.category='Autres soins') DESC,p.id DESC":'p.id DESC';
 const items=(await db.prepare(`SELECT ${fields} FROM products p WHERE ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values,limit,paginated?(page-1)*limit:0).all()).results;
 if(!paginated)return items;
 const result={items,total,page,pages};
 if(admin)result.published=(await db.prepare('SELECT COUNT(*) AS n FROM products WHERE active=1').first()).n;
 return result;
}
