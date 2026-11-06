import {test,expect} from '@playwright/test';
const headers={Origin:'http://localhost:8788'};
test('dashboard sections, protected settings, inventory threshold and storefront configuration',async({page})=>{
 const request=page.request;
 expect((await request.get('/api/admin/summary')).status()).toBe(401);
 expect((await request.put('/api/admin/settings',{headers,data:{announcement:'Unauthorised'}})).status()).toBe(401);
 await page.goto('/admin');await page.getByLabel('Mot de passe administrateur').fill('local-test-password-only');await page.getByRole('button',{name:'Se connecter'}).click();
 await expect(page.getByRole('heading',{name:'Tableau de bord',exact:true})).toBeVisible();await expect(page.locator('.dashboard-sidebar nav button')).toHaveCount(7);await expect(page.locator('#floating-cart')).toHaveCount(0);
 const summary=await (await request.get('/api/admin/summary')).json();expect(summary.products.total).toBeGreaterThan(13000);expect(summary.orders).toHaveProperty('revenue');
 const original=await (await request.get('/api/admin/settings')).json();
 try{
 await page.getByRole('button',{name:'07 Paramètres'}).click();await page.getByLabel('Texte du bandeau supérieur').fill('Votre boutique de soins au Maroc');await page.getByLabel('Téléphone',{exact:true}).fill('+212612345678');await page.getByLabel('Seuil de stock faible').fill('7');await page.getByLabel('Message de livraison affiché au panier et dans les questions fréquentes').fill('Livraison test confirmée par téléphone.');await page.getByRole('button',{name:'Enregistrer les paramètres'}).click();await expect(page.locator('#settings-saved')).toHaveText('Paramètres enregistrés.');
 expect((await request.put('/api/admin/settings',{headers,data:{...original,low_stock_threshold:0}})).status()).toBe(400);
 const publicSettings=await (await request.get('/api/settings')).json();expect(publicSettings).not.toHaveProperty('low_stock_threshold');expect(publicSettings.announcement).toBe('Votre boutique de soins au Maroc');expect(publicSettings).not.toHaveProperty('ADMIN_PASSWORD');
 await page.getByRole('button',{name:'04 Stocks & alertes'}).click();await expect(page.getByRole('heading',{name:'Niveaux de stock'})).toBeVisible();await page.getByRole('combobox',{name:'Stock',exact:true}).selectOption('low');await page.getByRole('button',{name:'Rechercher',exact:true}).click();await expect(page.getByRole('combobox',{name:'Stock',exact:true})).toHaveValue('low');const stock=await (await request.get('/api/admin/products?page=1&stock=low&threshold=1000')).json();expect(stock.items.every(p=>p.stock>0&&p.stock<=7)).toBeTruthy();
 await page.getByRole('button',{name:'02 Commandes'}).click();await expect(page.locator('#order-filter')).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter la sélection CSV'}).click();expect((await download).suggestedFilename()).toBe('commandes-selection.csv');
 await page.getByRole('button',{name:'05 Clients'}).click();await expect(page.getByRole('heading',{name:'Clients des dernières commandes'})).toBeVisible();await page.getByRole('button',{name:'06 Catégories & marques'}).click();await expect(page.locator('[data-admin-category]')).toHaveCount(13);
 await expect(page.getByRole('button',{name:/Accès & sécurité/})).toHaveCount(0);
 await page.getByRole('button',{name:'01 Vue générale'}).click();await page.screenshot({path:'/tmp/dashboard-general.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.getByRole('button',{name:'07 Paramètres'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'/tmp/dashboard-settings-mobile.png',fullPage:true});
 await page.goto('/');await expect(page.locator('.announcement')).toContainText('Votre boutique de soins au Maroc');await expect(page.locator('footer')).toContainText('+212612345678');await page.getByText('Comment connaître les frais de livraison ?', {exact:true}).click();await expect(page.locator('.store-faq details[open]')).toContainText('Livraison test confirmée par téléphone.');
 }finally{expect((await request.put('/api/admin/settings',{headers,data:original})).ok()).toBeTruthy();}
});
