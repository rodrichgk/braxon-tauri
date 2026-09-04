using stk500;

namespace stk500v2;

public class CMD_READ_LOCK_ISP : MESSAGE_CMD
{
	public CMD_READ_LOCK_ISP()
	{
		responselen = 10;
		CMD = new byte[6]
		{
			Constants_v2.CMD_READ_LOCK_ISP,
			0,
			0,
			0,
			0,
			0
		};
	}
}
