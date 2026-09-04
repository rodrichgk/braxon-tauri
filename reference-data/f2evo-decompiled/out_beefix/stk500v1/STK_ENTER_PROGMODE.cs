using stk500;

namespace stk500v1;

public class STK_ENTER_PROGMODE : MESSAGE_CMD
{
	public STK_ENTER_PROGMODE()
	{
		responselen = 2;
		CMD = new byte[2]
		{
			Constants_v1.STK_ENTER_PROGMODE,
			Constants_v1.CRC_EOP
		};
	}
}
