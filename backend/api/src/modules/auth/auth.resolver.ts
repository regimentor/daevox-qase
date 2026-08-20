import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@Resolver()
export class AuthResolver {
  public constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Mutation()
  public register(
    @Args('email') email: string,
    @Args('name') name: string,
    @Args('password') password: string,
  ) {
    return this.auth.register(email, name, password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Mutation()
  public login(@Args('email') email: string, @Args('password') password: string) {
    return this.auth.login(email, password);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Mutation()
  public refresh(@Args('refreshToken') refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }

  @Public()
  @Mutation()
  public logout(@Args('refreshToken') refreshToken: string) {
    return this.auth.logout(refreshToken);
  }
}
