import { getDb, closeDb } from '../src/db/index.js';
import { createAdminUser, findAdminByUsername } from '../src/db/auth.js';
import { createCategory, listCategories } from '../src/db/categories.js';
import { createArticle, listAllArticles } from '../src/db/articles.js';
import { config } from '../src/config.js';

console.log('🌱 Starting database seeding for HisarKiAawaj...');

const db = getDb();

// 1. Seed Default Administrator
const existingAdmin = findAdminByUsername(config.defaultAdmin.username);
if (!existingAdmin) {
  createAdminUser({
    username: config.defaultAdmin.username,
    password: config.defaultAdmin.password,
    fullName: config.defaultAdmin.fullName,
    role: 'admin'
  });
  console.log(`✅ Admin account created: ${config.defaultAdmin.username} (Password: ${config.defaultAdmin.password})`);
} else {
  console.log(`ℹ️ Admin account already exists: ${config.defaultAdmin.username}`);
}

// 2. Seed Initial Categories
const initialCategories = [
  { name: 'शहर (Hisar City)', slug: 'city', description: 'हिसार शहर की प्रमुख घटनाएं व स्थानीय समस्याएं', orderIndex: 1 },
  { name: 'अपराध (Crime)', slug: 'crime', description: 'पुलिस, न्यायालय व कानून व्यवस्था', orderIndex: 2 },
  { name: 'राजनीति (Politics)', slug: 'politics', description: 'हरियाणा व राष्ट्रीय राजनीति', orderIndex: 3 },
  { name: 'मंडी भाव (Mandi Rates)', slug: 'mandi-rates', description: 'हिसार व आदमपुर अनाज मंडी के दैनिक भाव', orderIndex: 4 },
  { name: 'लाइफस्टाइल (Lifestyle)', slug: 'lifestyle', description: 'कला, संस्कृति व सामाजिक उत्सव', orderIndex: 5 },
  { name: 'खेल (Sports)', slug: 'sports', description: 'स्थानीय व राज्यस्तरीय खेल प्रतियोगिताएं', orderIndex: 6 }
];

const categoryMap = {};
for (const cat of initialCategories) {
  const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cat.slug);
  if (!existing) {
    const created = createCategory(cat);
    categoryMap[cat.slug] = created.id;
    console.log(`✅ Category created: ${cat.name}`);
  } else {
    categoryMap[cat.slug] = existing.id;
  }
}

// 3. Seed Sample Articles
const sampleArticles = [
  {
    title: 'हिसार एयरपोर्ट से चंडीगढ़ और अयोध्या के लिए नियमित उड़ानें अगले माह से होंगी शुरू',
    slug: 'hisar-airport-chandigarh-ayodhya-flights-starting-next-month',
    excerpt: 'महाराजा अग्रसेन हवाई अड्डे से 72 सीटर विमानों के संचालन की डीजीसीए से मिली अनुमति।',
    content: '<p>हिसार के महाराजा अग्रसेन अंतरराष्ट्रीय हवाई अड्डे से बहुप्रतीक्षित यात्री उड़ानों का संचालन जल्द शुरू होने जा रहा है। नागरिक उड्डयन विभाग के अनुसार प्रथम चरण में चंडीगढ़, अयोध्या और देहरादून के लिए 72 सीटर वाणिज्यिक उड़ानें शुरू की जाएंगी।</p><p>स्थानीय व्यापारियों और आम जनता ने इस घोषणा का स्वागत किया है। इससे हिसार से दिल्ली व चंडीगढ़ की यात्रा में समय की भारी बचत होगी।</p>',
    featuredImage: 'https://images.unsplash.com/photo-1542296332-2e4473faf563?auto=format&fit=crop&w=800&q=80',
    categoryId: categoryMap['city'],
    status: 'published',
    isFeatured: 1,
    publishedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    title: 'हिसार अनाज मंडी भाव: सरसों में 150 रुपये का उछाल, गेहूं के भाव भी रहे स्थिर',
    slug: 'hisar-grain-mandi-rates-mustard-wheat-update',
    excerpt: 'नई आवक के साथ सरसों के भाव 5450 रुपये प्रति क्विंटल तक पहुंचे।',
    content: '<p>हिसार की नई अनाज मंडी में आज तिलहन और दलहन की जोरदार आवक देखने को मिली। व्यापारियों के अनुसार अच्छी गुणवत्ता वाली सरसों 5450 रुपये प्रति क्विंटल तक बिकी।</p><p>आदमपुर और हांसी मंडियों में भी किसानों को फसलों के संतोषजनक भाव मिल रहे हैं।</p>',
    featuredImage: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=800&q=80',
    categoryId: categoryMap['mandi-rates'],
    status: 'published',
    isFeatured: 0,
    publishedAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    title: '[ड्राफ्ट] सेक्टर 14 में नई सीवरेज लाइन बिछाने की योजना तैयार',
    slug: 'sector-14-new-sewerage-line-plan-draft',
    excerpt: 'नगर निगम ने 2.5 करोड़ रुपये का एस्टीमेट तैयार कर मंजूरी के लिए भेजा।',
    content: '<p>हिसार नगर निगम ने सेक्टर 14 में लंबे समय से जलभराव की समस्या से जूझ रहे निवासियों को राहत देने के लिए नई सीवरेज लाइन की डीपीआर तैयार की है।</p>',
    featuredImage: null,
    categoryId: categoryMap['city'],
    status: 'draft',
    isFeatured: 0,
    publishedAt: null
  }
];

for (const art of sampleArticles) {
  const existing = db.prepare('SELECT id FROM articles WHERE slug = ?').get(art.slug);
  if (!existing) {
    createArticle(art);
    console.log(`✅ Article created (${art.status}): ${art.title}`);
  }
}

// 4. Seed Initial Advertisements
const initialAds = [
  {
    name: 'Top Leaderboard Hospital Ad',
    placement: 'top_leaderboard',
    image_url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=970&q=80',
    destination_url: 'tel:9992487111',
    sponsor_title: 'महात्मा गांधी कैंसर संस्थान हिसar',
    sponsor_subtitle: '24 घंटे आपातकालीन सेवा · फोन: 99924-87111',
    cta_text: 'संपर्क करें ↗',
    is_active: 1
  },
  {
    name: 'Auto Spotlight Banner',
    placement: 'infeed_between_hero',
    image_url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=970&q=80',
    destination_url: 'tel:01662200000',
    sponsor_title: 'ROYAL ENFIELD HISAR — FESTIVE OFFER',
    sponsor_subtitle: 'बुलेट व हंटर 350 पर आकर्षक फाइनेंस व जीरो डाउनपेमेंट',
    cta_text: 'टेस्ट राइड ↗',
    is_active: 1
  }
];

for (const ad of initialAds) {
  const existing = db.prepare('SELECT id FROM advertisements WHERE name = ?').get(ad.name);
  if (!existing) {
    db.prepare(`
      INSERT INTO advertisements (name, placement, image_url, destination_url, sponsor_title, sponsor_subtitle, cta_text, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ad.name, ad.placement, ad.image_url, ad.destination_url, ad.sponsor_title, ad.sponsor_subtitle, ad.cta_text, ad.is_active);
    console.log(`✅ Ad created: ${ad.name}`);
  }
}

console.log('🎉 Seeding successfully completed!');
closeDb();

