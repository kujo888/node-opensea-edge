const axios = require('axios');
const { writeFile } = require('fs');

function saveAsJSON(data) {
  const jsonObj = JSON.stringify(data, null, 2);
  writeFile('data.json', jsonObj, () => { });
}

const getContentByURL = async (url) => {
  try {
    return (await axios.get(url)).data;
  } catch (error) {
    throw new Error(error);
  }
}

module.exports = {
  saveAsJSON,
  getContentByURL
}
