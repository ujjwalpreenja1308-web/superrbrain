import { publishToWordPress, testWordPressConnection } from "./wordpress.service.js";
import { publishToShopify, testShopifyConnection } from "./shopify.service.js";
import { publishToWebflow, testWebflowConnection } from "./webflow.service.js";
import { decryptCredentials } from "../credentials.service.js";

export interface PublishResult {
  platform_post_id: string;
  platform_url: string;
}

export async function publishPage(
  publisherType: string,
  encryptedCredentials: string,
  post: { title: string; content_html: string; tldr: string }
): Promise<PublishResult> {
  const credentialsJson = decryptCredentials(encryptedCredentials);
  const credentials = JSON.parse(credentialsJson);

  switch (publisherType) {
    case "wordpress":
      return publishToWordPress(credentials, post);
    case "shopify":
      return publishToShopify(credentials, post);
    case "webflow":
      return publishToWebflow(credentials, post);
    default:
      throw new Error(`Unknown publisher type: ${publisherType}`);
  }
}

export async function testPublisherConnection(
  publisherType: string,
  encryptedCredentials: string
): Promise<void> {
  const credentialsJson = decryptCredentials(encryptedCredentials);
  const credentials = JSON.parse(credentialsJson);

  switch (publisherType) {
    case "wordpress":
      return testWordPressConnection(credentials);
    case "shopify":
      return testShopifyConnection(credentials);
    case "webflow":
      return testWebflowConnection(credentials);
    default:
      throw new Error(`Unknown publisher type: ${publisherType}`);
  }
}
