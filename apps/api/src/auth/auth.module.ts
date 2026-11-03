import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { SessionService } from './session.service';
import { SocketTicketService } from './socket-ticket.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, OAuthService, SocketTicketService],
  exports: [SessionService, AuthService, SocketTicketService],
})
export class AuthModule {}
