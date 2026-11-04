import pytest

from backend.mystic_auth.procrastinate_tasks import alert_tasks

MODULE = "backend.mystic_auth.procrastinate_tasks.alert_tasks"


@pytest.mark.asyncio
async def test_task_posts_the_alert_once(mocker):
    send = mocker.patch(f"{MODULE}.send_alert", new_callable=mocker.AsyncMock)
    await alert_tasks.deliver_security_alert_task("policy_assigned", {"metadata": {"a": 1}})
    send.assert_awaited_once_with("policy_assigned", {"metadata": {"a": 1}})


@pytest.mark.asyncio
async def test_task_logs_and_reraises_so_procrastinate_retries(mocker):
    mocker.patch(f"{MODULE}.send_alert", side_effect=RuntimeError("ntfy unreachable"))
    log = mocker.patch(f"{MODULE}.logger.error")
    with pytest.raises(RuntimeError, match="ntfy unreachable"):
        await alert_tasks.deliver_security_alert_task("policy_assigned", {})
    log.assert_called_once()
    assert "policy_assigned" in log.call_args.args
