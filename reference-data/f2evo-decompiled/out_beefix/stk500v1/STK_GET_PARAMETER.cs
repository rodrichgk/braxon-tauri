using stk500;

namespace stk500v1;

public class STK_GET_PARAMETER : MESSAGE_CMD
{
	public STK_GET_PARAMETER(byte value)
	{
		responselen = 3;
		CMD = new byte[3]
		{
			Constants_v1.STK_GET_PARAMETER,
			value,
			Constants_v1.CRC_EOP
		};
	}
}
