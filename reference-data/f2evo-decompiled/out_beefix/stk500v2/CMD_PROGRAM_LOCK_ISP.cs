using stk500;

namespace stk500v2;

public class CMD_PROGRAM_LOCK_ISP : MESSAGE_CMD
{
	public CMD_PROGRAM_LOCK_ISP(byte value)
	{
		responselen = 9;
		CMD = new byte[5]
		{
			Constants_v2.CMD_PROGRAM_LOCK_ISP,
			0,
			0,
			0,
			value
		};
	}
}
