#include <napi.h>

typedef struct {
    const char *language_name;
    const TSLanguage *language;
} Language;

extern "C" const TSLanguage *tree_sitter_sas();

static Napi::Value Language(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    result.Set(
        Napi::String::New(env, "languageName"),
        Napi::String::New(env, "sas"));
    result.Set(
        Napi::String::New(env, "languageFunction"),
        Napi::Function::New(env, [](const Napi::CallbackInfo &info) -> Napi::Value {
            Napi::Env env = info.Env();
            return Napi::External<const TSLanguage>::New(env, tree_sitter_sas());
        }));
    return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "sas"), Language({}));
    return exports;
}

NODE_API_MODULE(tree_sitter_sas_binding, Init)
