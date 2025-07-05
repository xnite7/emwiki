export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const { userId, productId, price } = body;

    if (!userId || !productId) {
      return new Response("Missing fields", { status: 400 });
    }

    console.log(`✅ Purchase: User ${userId} bought Product ${productId} for ${price} Robux`);

    // Optional: Save to D1, KV, or send to Discord/webhook here

    return new Response("OK", { status: 200 });
  } catch (err) {
    return new Response("Invalid JSON", { status: 400 });
  }
}
