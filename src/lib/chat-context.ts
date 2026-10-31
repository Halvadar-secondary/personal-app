// Shared by the chat engine (which writes the block) and the domain and
// panel code that hide it: the app's context sits in user messages but
// was not typed by the owner.
export const CONTEXT_MARKER = "Context from the app (not typed by the owner):";
