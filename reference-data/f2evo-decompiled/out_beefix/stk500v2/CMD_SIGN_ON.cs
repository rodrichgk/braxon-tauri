using stk500;

namespace stk500v2;

public class CMD_SIGN_ON : MESSAGE_CMD
{
	public CMD_SIGN_ON()
	{
		responselen = 17;
		CMD = new byte[1] { Constants_v2.CMD_SIGN_ON };
	}
}
