from importlib import import_module

native_sdk = import_module("backend.app.sdk")
docker_sdk = import_module("app.sdk")


def test_docker_and_native_sdk_imports_share_extension_types() -> None:
    assert docker_sdk.ConditionHandler is native_sdk.ConditionHandler
    assert docker_sdk.register_condition_type is native_sdk.register_condition_type
