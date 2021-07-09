# hexstreamers
The HEX TV Guide, multiple lists of community content, automatically refreshed every few minutes

Website - https://HEXstreamers.com

- Online Streams List
- Offline Streams List
- Scheduled/Upcoming Youtube Streams List
- Youtube Videos List
- RSS Feed List
- TikTok List

Twitter Bot - https://twitter.com/HEXstreamers   
Telegram Bot - https://t.me/HEXstreamers   

# Setup

0. Rent Linux Server & Connect to it  
Server - Vultr - https://www.vultr.com/  
SSH - Putty - https://www.putty.org/  

1. Install Nodejs and NPM  
`sudo apt update`  
`sudo apt install nodejs`  
`sudo apt install npm`  
`nodejs -v`  

2. Install Firefox  
`npm install firefox`

3. Download Code  
`git clone https://github.com/togoshige/hexstreamers.git`

4. Copy config-default.json to config.json and set the values  
`cp config-default.json config.json`  
`vi config.json`  //i - Insert mode, Press Esc and :q - Quit, or :wq - Write and Quit  
(Or download it, make the changes it and then upload it - Filezilla: https://filezilla-project.org/)

5. Create MongoDB Atlas Database  
https://www.mongodb.com/cloud/atlas

6. Run Start/Update script  
`./update.sh`  

# More Setup

A. Buy Domain  
https://www.namecheap.com/  

B. Redirect Domain  
https://www.namecheap.com/support/knowledgebase/article.aspx/9837/46/how-to-connect-a-domain-to-a-server-or-hosting/  

C. Setup SSL  
https://www.namecheap.com/support/knowledgebase/article.aspx/9704/14/generating-a-csr-on-nodejs/  
https://www.namecheap.com/support/knowledgebase/article.aspx/9705/33/installing-an-ssl-certificate-on-nodejs/  
https://stackoverflow.com/questions/31156884/how-to-use-https-on-node-js-using-express-socket-io/31165649#31165649  
