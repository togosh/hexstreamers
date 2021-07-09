# hexstreamers
The HEX TV Guide, multiple lists of community content, automatically refreshed every few minutes

https://HEXstreamers.com

- Online Streams List
- Offline Streams List
- Scheduled/Upcoming Youtube Streams List
- Youtube Videos List
- RSS Feed List
- TikTok List

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

