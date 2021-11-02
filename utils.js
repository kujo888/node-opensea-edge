const axios = require('axios');

const getContentByURL = async (url) => {
  try {
    return (await axios.get(url)).data;
  } catch (error) {
    throw new Error(error);
  }
}

module.exports = {
  getContentByURL
}
