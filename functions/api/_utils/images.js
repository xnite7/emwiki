/**
 * Shared Cloudflare Images upload helper
 *
 * Used by /api/images/upload (admin manual uploads) and
 * /api/items/sync-icons (automated Roblox asset icon sync).
 */

/**
 * Upload an image blob/file to Cloudflare Images.
 *
 * @param {Blob|File} file - image bytes (a File with name/type, or a Blob)
 * @param {string} filename - filename hint sent to Cloudflare Images
 * @param {object} env - Workers environment bindings
 * @returns {Promise<{ id: string, url: string, variants: string[] }>}
 * @throws {Error} with a descriptive message on configuration or API failure
 */
export async function uploadImageToCloudflareImages(file, filename, env) {
    const accountId = env.CF_ACCOUNT_ID || 'd9fecb3357660ea0fcfee5b23d5dd2f6';
    const accountHash = env.CF_ACCOUNT_HASH || 'I2Jsf9fuZwSztWJZaX0DJA';
    const apiToken = env.CF_IMAGES_API_TOKEN;

    if (!accountId || !apiToken) {
        throw new Error('Cloudflare Images not configured. Please set CF_ACCOUNT_ID and CF_IMAGES_API_TOKEN environment variables.');
    }

    const cfFormData = new FormData();
    cfFormData.append('file', file, filename);

    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`
            },
            body: cfFormData
        }
    );

    if (!response.ok) {
        const errorData = await response.text();
        console.error('Cloudflare Images API error:', errorData);
        throw new Error(`Cloudflare Images API error (${response.status}): ${errorData}`);
    }

    const data = await response.json();

    if (!data.success) {
        throw new Error('Cloudflare Images upload failed: ' + JSON.stringify(data.errors));
    }

    const imageId = data.result.id;
    const variants = data.result.variants || [];
    const publicVariant = variants.find(v => v.includes('/public')) || variants[0] || '';
    const imageUrl = publicVariant || `https://imagedelivery.net/${accountHash}/${imageId}/public`;

    return { id: imageId, url: imageUrl, variants };
}
