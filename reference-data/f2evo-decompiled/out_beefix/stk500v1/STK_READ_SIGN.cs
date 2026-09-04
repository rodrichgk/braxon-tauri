using stk500;

namespace stk500v1;

public class STK_READ_SIGN : MESSAGE_CMD
{
	public STK_READ_SIGN()
	{
		responselen = 5;
		CMD = new byte[2]
		{
			Constants_v1.STK_READ_SIGN,
			Constants_v1.CRC_EOP
		};
	}
}
