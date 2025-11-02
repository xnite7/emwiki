// Bulk image upload endpoint for migrating local images to R2
export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const uploadResults = [];
    const errors = [];

    // Process all files in the form data
    for (const [fieldName, value] of formData.entries()) {
      if (value instanceof File || value instanceof Blob) {
        try {
          const file = value;
          const originalPath = formData.get(`${fieldName}_path`);

          // Preserve the original directory structure
          // Convert: imgs\gears\file.png -> imgs/gears/file.png
          const normalizedPath = originalPath
            ? originalPath.replace(/\\/g, '/')
            : `imgs/${Date.now()}-${file.name}`;

          // Upload to R2
          await env.MY_BUCKET.put(normalizedPath, await file.arrayBuffer(), {
            httpMetadata: {
              contentType: file.type || 'application/octet-stream'
            }
          });

          // Return the CDN URL
          const url = `https://cdn.emwiki.com/${normalizedPath}`;

          uploadResults.push({
            originalPath: originalPath,
            newPath: normalizedPath,
            url: url,
            filename: file.name,
            size: file.size
          });
        } catch (fileError) {
          errors.push({
            fieldName,
            error: fileError.message
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: uploadResults.length > 0,
      uploaded: uploadResults.length,
      errors: errors.length,
      results: uploadResults,
      errorDetails: errors
    }), {
      headers: { "Content-Type": "application/json" },
      status: errors.length > 0 && uploadResults.length === 0 ? 500 : 200
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
