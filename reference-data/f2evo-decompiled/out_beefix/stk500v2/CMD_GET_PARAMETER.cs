using stk500;

namespace stk500v2;

public class CMD_GET_PARAMETER : MESSAGE_CMD
{
	public CMD_GET_PARAMETER(byte value)
	{
		responselen = 9;
		CMD = new byte[2]
		{
			Constants_v2.CMD_GET_PARAMETER,
			value
		};
	}
}
