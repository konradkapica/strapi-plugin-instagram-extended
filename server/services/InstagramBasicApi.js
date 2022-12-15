'use strict';

const instagramSettings = require('../utils/settings');
const { getPluginSettings, setPluginSettings } = instagramSettings;
const fetchInstagram = require('../utils/fetchInstagram');

const album_fields = 'id,media_type,media_url,thumbnail_url,username,timestamp';
const media_fields = `${album_fields},caption`;

module.exports = ({ strapi }) => ({
  async downloadAlbum(parent, token) {
    const album = await fetchInstagram.callInstagramGraph(
      `/${parent.id}/children`,
      {
        access_token: token,
        fields: album_fields,
      },
    );
    const media = [];
    album.data.forEach((element) => {
      if (element.media_type == 'IMAGE') {
        media.push({
          parent: parent.id,
          id: element.id,
          url: element.media_url,
          timestamp: element.timestamp,
          caption: parent.caption,
          media_type: element.media_type,
        });
      }
    });
    return media;
  },

  async downloadImages() {
    const settings = await getPluginSettings();
    const token =
      settings.shortLivedAccessToken || settings.longLivedAccessToken;

    if (token === undefined) {
      return {
        error: 'Instagram download images error, there is no token!',
        status: 400,
      };
    }

    const instagramMedia = await fetchInstagram.callInstagramGraph(
      '/me/media',
      {
        access_token: token,
        fields: media_fields,
      },
    );
    let images = [];
    for (let element of instagramMedia.data) {
      if (element.media_type == 'IMAGE') {
        images.push({
          id: element.id,
          url: element.media_url,
          timestamp: element.timestamp,
          caption: element.caption,
          media_type: element.media_type,
        });
      } else if (element.media_type == 'CAROUSEL_ALBUM') {
        const album = await this.downloadAlbum(element, token);
        images = images.concat(album);
      }
    }
    this.insertImagesToDatabase(images);

    return images;
  },

  async isImageExists(image) {
    const entry = await strapi.db.query('plugin::instagram.image').findOne({
      where: { instagramId: image.id },
    });
    return (entry != null);
  },

  async insertImagesToDatabase(images) {
    for (let image of images) {
      if (!await this.isImageExists(image)) {
        const entry = await strapi.db.query('plugin::instagram.image').create({
          data: {
            instagramId: image.id,
            originalUrl: image.url,
            timestamp: image.timestamp,
            caption: image.caption,
            publishedAt: new Date(),
          },
        });
      }
    }
  },
});