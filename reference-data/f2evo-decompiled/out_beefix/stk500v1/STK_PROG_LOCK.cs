using stk500;

namespace stk500v1;

public class STK_PROG_LOCK : MESSAGE_CMD
{
	public STK_PROG_LOCK()
	{
		responselen = 2;
		CMD = new byte[2]
		{
			Constants_v1.STK_PROG_LOCK,
			Constants_v1.CRC_EOP
		};
	}
}
