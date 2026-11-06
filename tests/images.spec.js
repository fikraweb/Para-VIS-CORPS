import {test,expect} from '@playwright/test';
const headers={Origin:'http://localhost:8788'};
test('upload product photos from a device, append a gallery view, and replace the cover',async({page})=>{
 const request=page.request;
 const base={name:'Photo test '+Date.now(),brand:'Test image',category:'Visages',description:'Description avec photo.',price:12000,image:'',stock:2,active:1};
 expect((await request.post('/api/admin/products',{headers,data:{...base,image_upload:{mime:'image/webp',data:'AAAA'}}})).status()).toBe(401);
 await page.goto('/admin');await page.getByLabel('Mot de passe administrateur').fill('local-test-password-only');await page.getByRole('button',{name:'Se connecter'}).click();await page.getByRole('button',{name:'03 Produits'}).click();await page.getByRole('button',{name:'+ Ajouter un produit'}).click();
 let form=page.locator('#product-form');await form.getByLabel('Nom',{exact:true}).fill(base.name);await form.getByLabel('Marque',{exact:true}).fill(base.brand);await form.getByLabel('Prix (DH)').fill('120');await form.getByLabel('Stock',{exact:true}).fill('2');await form.getByLabel('Publier dans la boutique').check();await expect(form.locator('input[type=url]')).toHaveCount(0);
 await form.getByLabel('Choisir une photo').setInputFiles('public/category-products/visage-cutout.png');await expect(form.locator('.photo-status')).toContainText('Photo prête');await expect(form.locator('.product-photo-preview')).toBeVisible();await form.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('dialog')).not.toBeVisible();
 const results=await (await request.get('/api/admin/products?page=1&q='+encodeURIComponent(base.name))).json();const id=results.items[0].id;let product=await (await request.get('/api/admin/products/'+id)).json();const first=product.image;expect(first).toMatch(/^\/api\/images\/[a-f0-9-]{36}$/);
 let response=await request.get(first);expect(response.status()).toBe(200);expect(response.headers()['content-type']).toBe('image/webp');expect((await response.body()).length).toBeGreaterThan(100);expect(response.headers()['x-content-type-options']).toBe('nosniff');expect((await request.head(first)).status()).toBe(200);
 // A malformed image is rejected without changing the product or creating a cover.
 expect((await request.post('/api/admin/products',{headers,data:{...product,image_upload:{mime:'image/webp',data:btoa('<script>bad</script>')}}})).status()).toBe(400);
 await page.setViewportSize({width:390,height:844});
 const edit=async()=>{await page.getByRole('button',{name:'03 Produits'}).click();await page.getByLabel('Rechercher une référence').fill(base.name);await page.locator('#admin-search').getByRole('button',{name:'Rechercher',exact:true}).click();await page.locator(`[data-edit="${id}"]`).click();return page.locator('#product-form');};
 form=await edit();await form.getByLabel('Choisir une photo').setInputFiles('public/category-products/corps-cutout.png');await expect(form.locator('.photo-status')).toContainText('Photo prête');expect(await form.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();await form.getByRole('combobox',{name:'Utilisation de la nouvelle photo'}).selectOption('append');await form.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('dialog')).not.toBeVisible();product=await (await request.get('/api/admin/products/'+id)).json();expect(product.image).toBe(first);expect(JSON.parse(product.images_json)).toHaveLength(2);
 form=await edit();await form.getByLabel('Choisir une photo').setInputFiles('public/category-products/bebe-maman-cutout.png');await expect(form.locator('.photo-status')).toContainText('Photo prête');await form.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('dialog')).not.toBeVisible();product=await (await request.get('/api/admin/products/'+id)).json();expect(product.image).not.toBe(first);expect(JSON.parse(product.images_json)[0]).toBe(product.image);expect(JSON.parse(product.images_json)).toHaveLength(2);
 await page.goto('/');await page.getByLabel('Rechercher un produit').fill(base.name);await page.locator('#products').getByRole('button',{name:base.name,exact:true}).click();await expect(page.locator('.sheet-main-image')).toHaveAttribute('src',product.image);await expect(page.locator('.sheet-thumbnails button')).toHaveCount(2);expect(await page.locator('.sheet-main-image').evaluate(async image=>{await image.decode();return image.naturalWidth>0;})).toBeTruthy();await page.locator('#detail-add').click();await page.getByRole('button',{name:'Voir mon panier'}).click();await expect(page.locator('.cart-product-image')).toHaveAttribute('src',product.image);
 // Persistent uploaded photos remain publicly available after the admin session ends.
 await request.post('/api/logout',{headers});expect((await request.get(product.image)).status()).toBe(200);expect((await request.post('/api/admin/products',{headers,data:product})).status()).toBe(401);
});

test.afterEach(async({request})=>{
 await request.post('/api/login',{headers,data:{password:'local-test-password-only'}});
 const result=await (await request.get('/api/admin/products?page=1&q=Photo%20test')).json();
 for(const row of result.items||[]){if(row.brand!=='Test image'||!row.active)continue;const product=await (await request.get('/api/admin/products/'+row.id)).json();expect((await request.post('/api/admin/products',{headers,data:{...product,active:0}})).ok()).toBeTruthy();}
 await request.post('/api/logout',{headers});
});
