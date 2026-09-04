using stk500;

namespace stk500v1;

public class STK_READ_LOCK : MESSAGE_CMD
{
	public STK_READ_LOCK()
	{
		responselen = 3;
		CMD = new byte[2]
		{
			Constants_v1.STK_READ_LOCK,
			Constants_v1.CRC_EOP
		};
	}
}
