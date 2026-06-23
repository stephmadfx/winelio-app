import puppeteer from "puppeteer";

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  const url = 'https://fr.wikipedia.org/wiki/Liste_des_communes_de_France_les_plus_peupl%C3%A9es';
  await page.goto(url, { waitUntil: "domcontentloaded" });
  
  const cities = await page.evaluate(() => {
    const table = document.querySelector("table.wikitable");
    if (!table) return [];
    
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const list = [];
    
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      // If this is a valid data row (headers are th, data is td)
      if (cells.length >= 6) {
        // Commune is typically column index 2 (Rang=0, CodeInsee=1, Commune=2)
        // Let's find the cell that contains the commune link
        const communeCell = cells[2];
        if (communeCell) {
          const link = communeCell.querySelector("a");
          if (link) {
            let name = link.textContent.trim();
            // Clean up name (remove footnotes, e.g. "Paris[a]" -> "Paris")
            name = name.replace(/\[\w+\]/g, "").trim();
            if (name && !list.includes(name)) {
              list.push(name);
            }
          }
        }
      }
    }
    return list;
  });
  
  await browser.close();
  console.log(`Found ${cities.length} clean cities.`);
  console.log(JSON.stringify(cities, null, 2));
}

run().catch(console.error);
