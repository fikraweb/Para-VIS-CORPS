import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('catalogue-manifest.json','utf8'));
const origin={Origin:'http://localhost:8788'};
test('complete imported catalogue, category filtering, pagination and stock management',async({page,request})=>{
 const first=await (await request.get('/api/products?page=1')).json();expect(first.total).toBeGreaterThanOrEqual(manifest.sellable_formats);expect(first.items).toHaveLength(24);expect(first.pages).toBeGreaterThan(500);expect(first.items.every(p=>p.category==='Autres soins')).toBeTruthy();
 const second=await (await request.get('/api/products?page=2')).json();expect(first.items.map(p=>p.id).filter(id=>second.items.some(p=>p.id===id))).toHaveLength(0);
 const last=await (await request.get('/api/products?page=999999')).json();expect(last.page).toBe(last.pages);expect(last.items.length).toBeGreaterThan(0);
 const collections=await (await request.get('/api/collections')).json();expect(collections).toHaveLength(manifest.collections);
 const filtered=await (await request.get('/api/products?page=1&collection=a-derma')).json();expect(filtered.total).toBeGreaterThan(0);expect(filtered.total).toBeLessThan(100);
 expect((await (await request.get('/api/products?page=1&q=%27%20OR%201%3D1--')).json()).total).toBe(0);
 expect((await (await request.get('/api/products?page=1&q=%25')).json()).total).toBeLessThan(first.total);
 const candidate=second.items.find(p=>p.source_variant_id);expect(candidate).toBeTruthy();const original=await (await request.get('/api/products/'+candidate.id)).json();expect(original.stock).toBe(10);expect(original.price).toBeGreaterThan(0);expect(JSON.parse(original.images_json).length).toBeGreaterThan(0);
 // The simplified category bar replaces the old collection dropdown.
 await page.goto('/');await expect(page.locator('#products .product')).toHaveCount(24);await expect(page.locator('#collection-filter')).toHaveCount(0);
 await page.getByRole('button',{name:'Suivant →',exact:true}).click();await expect(page.locator('#catalogue-pagination')).toContainText('Page 2 /');
 await page.getByRole('button',{name:`Ajouter ${candidate.name} au panier`,exact:true}).click();
 // The cart must resolve its own IDs, even after the visible catalogue changes.
 await page.getByLabel('Rechercher un produit').fill('zzzz-nothing-exists');await expect(page.getByRole('heading',{name:'Aucun soin trouvé'})).toBeVisible();
 await page.getByRole('button',{name:/Panier/}).click();await expect(page.locator('dialog')).toContainText(candidate.name);await expect(page.getByRole('button',{name:'Confirmer ma commande'})).toBeVisible();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 // A real imported format can be ordered; price is still enforced on the server.
 try{
 const created=await request.post('/api/orders',{headers:origin,data:{name:'Test catalogue',phone:'0612345678',city:'Rabat',address:'Adresse de test',items:[{id:candidate.id,quantity:1}],total:1}});expect(created.status()).toBe(201);expect((await created.json()).total).toBe(original.price);
 expect((await (await request.get('/api/products/'+candidate.id)).json()).stock).toBe(9);
 await request.post('/api/login',{headers:origin,data:{password:'local-test-password-only'}});
 await page.goto('/admin');await page.getByLabel('Mot de passe administrateur').fill('local-test-password-only');await page.getByRole('button',{name:'Se connecter'}).click();
 await page.getByRole('button',{name:'03 Produits'}).click();await page.getByLabel('Rechercher une référence').fill(candidate.name);await page.locator('#admin-search').getByRole('button',{name:'Rechercher',exact:true}).click();await page.locator(`[data-edit="${candidate.id}"]`).click();await expect(page.getByLabel('Stock',{exact:true})).toHaveValue('9');await page.getByLabel('Stock',{exact:true}).fill('7');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('dialog')).not.toBeVisible();expect((await (await request.get('/api/products/'+candidate.id)).json()).stock).toBe(7);
 }finally{await request.post('/api/login',{headers:origin,data:{password:'local-test-password-only'}});const restore=await request.post('/api/admin/products',{headers:origin,data:original});expect(restore.ok()).toBeTruthy();}
});

test('thirteen source categories and the compact category menu remain accessible',async({page,request})=>{
 const counts=JSON.parse(fs.readFileSync('navigation-category-counts.json','utf8'));
 const names=Object.keys(counts);
 for(const name of names){const r=await request.get('/api/products?'+new URLSearchParams({page:1,category:name}));expect(r.ok(),name).toBeTruthy();const data=await r.json();expect(data.total,name).toBe(counts[name].formats);expect(data.items.length,name).toBeGreaterThan(0);}
 await page.goto('/');await expect(page.locator('.menu-category:visible')).toHaveCount(13);await expect(page.locator('.category-book')).toHaveCount(0);
 for(const name of names)await expect(page.getByRole('button',{name:'Découvrir '+name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Découvrir Sport',exact:true}).click();await expect(page.locator('#catalogue-count')).toHaveText(counts.Sport.formats+' références et formats');
 await page.getByRole('button',{name:'Découvrir Minceur',exact:true}).click();await expect(page.locator('#catalogue-count')).toHaveText(counts.Minceur.formats+' références et formats');
 await page.getByRole('button',{name:'Découvrir K-beauty',exact:true}).click();await expect(page.locator('#catalogue-count')).toHaveText(counts['K-beauty'].formats+' références et formats');
 await expect(page.locator('[data-filter]')).toHaveCount(14);
});


test('category toolbar stays visible while scrolling and filters without returning to the hero',async({page})=>{
 const bar=page.locator('.catalogue-toolbar');
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:800});await page.goto('/');await expect(page.locator('#products .product')).toHaveCount(24);
  await page.locator('#products .product').nth(8).scrollIntoViewIfNeeded();
  const top=await bar.evaluate(e=>e.getBoundingClientRect().top);expect(top).toBeGreaterThanOrEqual(-1);expect(top).toBeLessThanOrEqual(1);
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/products?')&&new URL(r.url()).searchParams.get('category')==='Homme'),page.locator('[data-filter="Homme"]').click()]);
  await expect(page.locator('[data-filter="Homme"]')).toHaveClass('selected');await expect(page.locator('#products .product-category').first()).toHaveText('Homme');
  await expect.poll(()=>bar.evaluate(e=>e.getBoundingClientRect().top)).toBeLessThanOrEqual(14);
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(300);
  await page.screenshot({path:`test-results/sticky-categories-${width}.png`});
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/products?')&&new URL(r.url()).searchParams.get('category')==='Tous'),page.locator('[data-filter="Tous"]').click()]);
  await expect(page.locator('#products .product-category')).toHaveCount(0);
 }
});

test('discovery campaigns show current prices and open purchasable products outside the current page',async({page,request})=>{
 const products=await (await request.get('/api/products?source_ids=8036739055791,6728782446767,6729087844527,6728969552047,6729103081647')).json();expect(products).toHaveLength(5);const glow=products.find(p=>p.source_product_id==='8036739055791');
 await page.goto('/');const featured=page.locator('.campaign-glow [data-featured="glow"]');await expect(featured).toBeEnabled();await expect(page.locator('.campaign-glow [data-featured-price="glow"]')).toHaveText((glow.price/100).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})+' DH');await expect(page.locator('.discovery-aside')).toBeVisible();await expect(page.locator('.campaign-backdrop')).toHaveCount(3);await page.locator('.discovery-campaigns').scrollIntoViewIfNeeded();expect(await page.locator('.campaign-backdrop').evaluateAll(images=>Promise.all(images.map(async image=>{await image.decode();return image.naturalWidth>=500;})))).toEqual([true,true,true]);
 await featured.click();await expect(page.locator('dialog').getByRole('heading',{name:glow.name,exact:true})).toBeVisible();await page.locator('dialog').getByRole('button',{name:'Ajouter au panier',exact:true}).click();await page.getByRole('button',{name:'Fermer',exact:true}).click();await page.getByRole('button',{name:/Panier/}).click();await expect(page.locator('dialog')).toContainText(glow.name);await page.locator('[data-remove]').click();await expect(page.locator('dialog')).toContainText('Votre panier attend vos premiers essentiels.');await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.locator('.campaign-body [data-category="Corps & Bains"]').click();await expect(page.locator('[data-filter="Corps & Bains"]')).toHaveAttribute('aria-pressed','true');
 await page.getByText('Comment régler ma commande ?', {exact:true}).click();await expect(page.locator('.store-faq details[open]')).toContainText('Le paiement se fait à la livraison.');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.discovery-aside')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('menu and cart dismiss on outside clicks without dismissing inside clicks',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 const toggle=page.getByRole('button',{name:'Ouvrir le menu'});
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.locator('#main-nav').click({position:{x:5,y:5}});await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.locator('.announcement').click();await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();await page.keyboard.press('Escape');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await page.locator('#open-cart').click();const dialog=page.locator('#cart-dialog');await expect(dialog).toBeVisible();
 await page.getByRole('heading',{name:'Mon panier'}).click();await expect(dialog).toBeVisible();
 await page.mouse.click(2,2);await expect(dialog).not.toBeVisible();
 await page.locator('#open-cart').click();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});

test('persistent basket and responsive product sheet',async({page})=>{
 await page.goto('/');await page.locator('.store-faq').scrollIntoViewIfNeeded();
 const basket=page.getByRole('button',{name:'Ouvrir le panier',exact:true});await expect(basket).toBeInViewport();await basket.click();await expect(page.getByRole('heading',{name:'Mon panier'})).toBeVisible();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.locator('.campaign-glow [data-featured="glow"]').click();const sheet=page.locator('dialog.product-dialog');await expect(sheet).toBeVisible();await expect(sheet.locator('.sheet-main-image')).toBeVisible();await expect(sheet.locator('.sheet-price')).toContainText('DH');await expect(sheet.locator('.sheet-description')).toContainText('Description');expect(await sheet.locator('.sheet-description').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.sheet-main-image').getBoundingClientRect().bottom)).toBeTruthy();
 await sheet.locator('.sheet-main-image').evaluate(image=>image.decode().catch(()=>{}));await page.screenshot({path:'/tmp/product-sheet-desktop.png'});
 await sheet.getByRole('button',{name:'Ajouter au panier',exact:true}).click();await expect(page.locator('#floating-cart-count')).toHaveText('1');
 await page.setViewportSize({width:390,height:844});await sheet.evaluate(el=>el.scrollTop=0);await expect(sheet.locator('.sheet-price')).toBeInViewport();await expect(sheet.locator('#detail-add')).toBeInViewport();expect(await sheet.locator('.sheet-description').evaluate(el=>el.getBoundingClientRect().top>document.querySelector('#detail-add').getBoundingClientRect().bottom)).toBeTruthy();expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();await page.screenshot({path:'/tmp/product-sheet-mobile.png'});
 await sheet.getByRole('button',{name:'Voir mon panier',exact:false}).click();await expect(page.getByRole('heading',{name:'Mon panier'})).toBeVisible();await expect(page.locator('#cart-dialog')).not.toHaveClass('product-dialog');await expect(page.locator('.cart-product-image')).toBeVisible();await expect(page.locator('.cart-product-image')).toHaveAttribute('src',/^https:/);expect(await page.locator('#cart-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
});

test('atelier hero has responsive 3D categories and respects reduced motion',async({page})=>{
 await page.goto('/');const hero=page.locator('.atelier-hero');await expect(hero).toBeVisible();await expect(hero.locator('.hero-depth-scene img')).toHaveAttribute('src','/hero-atelier-background.png');await expect(hero.locator('.menu-category')).toHaveCount(13);
 await page.mouse.move(800,250);await expect(hero).toHaveAttribute('data-depth',/^[nsew]+$|center/);
 await page.locator('.store-faq').scrollIntoViewIfNeeded();await expect(hero).toHaveClass(/atelier-paused/);
 await page.emulateMedia({reducedMotion:'reduce'});await hero.scrollIntoViewIfNeeded();expect(await page.locator('.atelier-orbit-ring').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');expect(await hero.locator('.bubble-motion').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(hero.getByRole('link',{name:'Explorer toute la boutique'})).toBeVisible();}
});
