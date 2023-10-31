import { ThirdwebStorage } from "@thirdweb-dev/storage";
import fs from 'fs';

const storage = new ThirdwebStorage();

(async () => {
    const upload = await storage.upload (fs.readFileSync('C:/Users/Aayushman/Desktop/k logo.png'))
    console.log('Upload URL: ', storage.resolveScheme(upload));

})();