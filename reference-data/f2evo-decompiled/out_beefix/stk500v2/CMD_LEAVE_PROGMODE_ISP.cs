using stk500;

namespace stk500v2;

public class CMD_LEAVE_PROGMODE_ISP : MESSAGE_CMD
{
	public CMD_LEAVE_PROGMODE_ISP()
	{
		responselen = 8;
		CMD = new byte[1] { Constants_v2.CMD_LEAVE_PROGMODE_ISP };
	}
}
