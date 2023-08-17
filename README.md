# 20something-webflow-scripts
Used to host files for the Webflow hosted 20Something site


## Getting Started


Desktop and mobile navigation code


<br />
<br />

### Updating scripts and deploying  

These scripts need to be used externally with Webflow, because Webflow has a limitation of 10,000 characters and these javascript files exceed that. Every time you make changes, please remember to update <script src=""></script> tags url, in the steps provided below:

- Select the repository you want to use and copy the url, for example: https://github.com/on-associates/20something-webflow-scripts/blob/main/navigation.min.js 
- Run through [JSDelivr](https://www.jsdelivr.com/) or [raw.githack](https://raw.githack.com) to create a cdn. 
- Insert the production url between the <script src=""></script> tags in Webflow.
